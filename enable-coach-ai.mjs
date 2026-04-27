import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, ".env.local");

const envContent = readFileSync(envPath, "utf8");
const env = {};
for (const line of envContent.split("\n")) {
  if (line && !line.startsWith("#")) {
    const [key, ...valueParts] = line.split("=");
    env[key.trim()] = valueParts.join("=").trim();
  }
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey);

async function enableCoachAiTier() {
  try {
    const { error } = await admin
      .from("site_settings")
      .upsert(
        { id: "default", coach_ai_tier_enabled: true },
        { onConflict: "id" }
      );

    if (error) {
      console.error("Error enabling Coach AI tier:", error);
      process.exit(1);
    }

    const { data, error: selectError } = await admin
      .from("site_settings")
      .select("id, coach_ai_tier_enabled")
      .eq("id", "default")
      .single();

    if (selectError) {
      console.error("Error reading settings:", selectError);
      process.exit(1);
    }

    console.log("✓ Coach AI tier enabled:", data);
  } catch (err) {
    console.error("Unexpected error:", err);
    process.exit(1);
  }
}

await enableCoachAiTier();
