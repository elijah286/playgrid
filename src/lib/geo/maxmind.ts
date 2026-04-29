import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { extract as tarExtract } from "tar";
import { Reader, type ReaderModel, type City } from "@maxmind/geoip2-node";
import {
  getStoredMaxMindLicenseKey,
  setMaxMindDownloadedAt,
} from "@/lib/site/maxmind-key";

const DB_PATH = join(tmpdir(), "playgrid-geolite2-city.mmdb");
const DB_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // refresh after 30 days

let readerPromise: Promise<ReaderModel | null> | null = null;

export type GeoLookup = {
  country: string | null;
  region: string | null;
  city: string | null;
  isEu: boolean;
};

const NULL_LOOKUP: GeoLookup = { country: null, region: null, city: null, isEu: false };

async function dbExistsAndFresh(): Promise<boolean> {
  try {
    const stat = await fs.stat(DB_PATH);
    return Date.now() - stat.mtimeMs < DB_MAX_AGE_MS;
  } catch {
    return false;
  }
}

async function downloadDb(licenseKey: string): Promise<void> {
  // GeoLite2 City is shipped as a gzipped tarball. The tar contains a single
  // dated directory holding GeoLite2-City.mmdb + LICENSE/COPYRIGHT. We extract
  // the .mmdb and write it directly to DB_PATH.
  const url = `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${encodeURIComponent(
    licenseKey,
  )}&suffix=tar.gz`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok || !res.body) {
    throw new Error(`MaxMind download failed: HTTP ${res.status}`);
  }

  const stagingDir = join(tmpdir(), `playgrid-mm-${Date.now()}`);
  await fs.mkdir(stagingDir, { recursive: true });

  // Stream: tarball -> gunzip -> tar extract into stagingDir
  await pipeline(
    Readable.fromWeb(res.body as never),
    createGunzip(),
    tarExtract({ cwd: stagingDir, strip: 1, filter: (p) => p.endsWith(".mmdb") }),
  );

  // The .mmdb is now somewhere under stagingDir; find and move it.
  const found = await findMmdb(stagingDir);
  if (!found) {
    throw new Error("MaxMind tarball did not contain a .mmdb file");
  }
  await fs.rename(found, DB_PATH);
  await fs.rm(stagingDir, { recursive: true, force: true });
}

async function findMmdb(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      const nested = await findMmdb(full);
      if (nested) return nested;
    } else if (e.name.endsWith(".mmdb")) {
      return full;
    }
  }
  return null;
}

async function loadReader(): Promise<ReaderModel | null> {
  const licenseKey = await getStoredMaxMindLicenseKey();
  if (!licenseKey) return null;

  if (!(await dbExistsAndFresh())) {
    await downloadDb(licenseKey);
    await setMaxMindDownloadedAt(new Date().toISOString());
  }
  const buf = await fs.readFile(DB_PATH);
  return Reader.openBuffer(buf);
}

function getReader(): Promise<ReaderModel | null> {
  if (!readerPromise) {
    readerPromise = loadReader().catch(() => null);
  }
  return readerPromise;
}

export async function refreshMaxMindDb(): Promise<{ ok: boolean; error?: string }> {
  try {
    const licenseKey = await getStoredMaxMindLicenseKey();
    if (!licenseKey) return { ok: false, error: "No MaxMind license key saved." };
    await downloadDb(licenseKey);
    await setMaxMindDownloadedAt(new Date().toISOString());
    readerPromise = null; // force reopen on next lookup
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Refresh failed.";
    return { ok: false, error: msg };
  }
}

// EU + EEA + UK. Used to gate click-ID/region/city/referrer storage behind
// consent for visitors who have GDPR/UK-GDPR rights.
const EU_COUNTRY_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO",
  "GB",
]);

export async function lookupGeo(ip: string | null | undefined): Promise<GeoLookup> {
  if (!ip) return NULL_LOOKUP;
  try {
    const reader = await getReader();
    if (!reader) return NULL_LOOKUP;
    const r: City = reader.city(ip);
    const country = r.country?.isoCode ?? null;
    const region = r.subdivisions?.[0]?.isoCode ?? null;
    const city = r.city?.names?.en ?? null;
    return {
      country,
      region,
      city,
      isEu: country ? EU_COUNTRY_CODES.has(country) : false,
    };
  } catch {
    return NULL_LOOKUP;
  }
}
