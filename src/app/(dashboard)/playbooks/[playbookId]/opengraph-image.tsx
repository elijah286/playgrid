import { ImageResponse } from "next/og";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";

export const runtime = "nodejs";
export const alt = "Example football playbook on xogridmaker";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: Promise<{ playbookId: string }> };

function fallback() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)",
          color: "white",
          fontSize: 72,
          fontWeight: 800,
          fontFamily: "system-ui, sans-serif",
          letterSpacing: "-0.02em",
        }}
      >
        xogridmaker
      </div>
    ),
    { ...size },
  );
}

export default async function PlaybookOgImage({ params }: Props) {
  const { playbookId } = await params;
  if (!hasSupabaseEnv()) return fallback();

  type BookRow = {
    name: string;
    season: string | null;
    sport_variant: string | null;
    color: string | null;
    logo_url: string | null;
    is_public_example: boolean | null;
    example_author_label: string | null;
    plays: { count: number }[] | { count: number } | null;
  };

  let book: BookRow | null = null;

  try {
    const svc = createServiceRoleClient();
    const { data } = await svc
      .from("playbooks")
      .select(
        "name, season, sport_variant, color, logo_url, is_public_example, example_author_label, plays(count)",
      )
      .eq("id", playbookId)
      .eq("is_archived", false)
      .maybeSingle();
    book = (data as BookRow | null) ?? null;
  } catch {
    return fallback();
  }

  if (!book || !book.is_public_example) return fallback();

  const name = book.name || "Example playbook";
  const season = book.season;
  const author = book.example_author_label;
  const accent = book.color || "#2563eb";
  const variantLabel = book.sport_variant
    ? SPORT_VARIANT_LABELS[book.sport_variant as SportVariant] ?? null
    : null;
  const agg = Array.isArray(book.plays) ? book.plays[0] : book.plays;
  const playCount = agg?.count ?? 0;
  const subParts = [variantLabel, season].filter(Boolean) as string[];
  const subline = subParts.join(" · ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0b1220",
          color: "white",
          fontFamily: "system-ui, sans-serif",
          padding: "72px",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 12,
            background: accent,
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 26,
            fontWeight: 700,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          xogridmaker · Example playbook
        </div>
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            gap: 36,
          }}
        >
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: 24,
              background: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {book.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={book.logo_url}
                alt=""
                width={136}
                height={136}
                style={{ objectFit: "contain" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: accent,
                  color: "white",
                  fontSize: 84,
                  fontWeight: 800,
                }}
              >
                {name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
            <div
              style={{
                fontSize: 64,
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
              }}
            >
              {name}
            </div>
            {subline && (
              <div
                style={{
                  fontSize: 28,
                  color: "rgba(255,255,255,0.75)",
                }}
              >
                {subline}
              </div>
            )}
            {author && (
              <div
                style={{
                  fontSize: 22,
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                by {author}
              </div>
            )}
          </div>
        </div>
        <div
          style={{
            marginTop: 48,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 20,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          <span>xogridmaker.com</span>
          {playCount > 0 && <span>{playCount} plays</span>}
        </div>
      </div>
    ),
    { ...size },
  );
}
