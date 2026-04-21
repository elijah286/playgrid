import { createServiceRoleClient } from "@/lib/supabase/admin";

const SITE_ROW_ID = "default";

export type ResendPreview = {
  configured: boolean;
  statusLabel: string;
  fromEmail: string | null;
};

export function previewResendConfig(
  key: string | null | undefined,
  fromEmail: string | null | undefined,
): ResendPreview {
  const k = (key ?? "").trim();
  const from = (fromEmail ?? "").trim();
  if (!k) {
    return {
      configured: false,
      statusLabel: "No Resend API key is saved yet.",
      fromEmail: from || null,
    };
  }
  const tail = k.length >= 4 ? k.slice(-4) : "••••";
  return {
    configured: true,
    statusLabel: `A Resend key is saved (ends with …${tail}).`,
    fromEmail: from || null,
  };
}

export async function getStoredResendConfig(): Promise<{
  apiKey: string | null;
  fromEmail: string | null;
  contactToEmail: string | null;
}> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("site_settings")
    .select("resend_api_key, resend_from_email, contact_to_email")
    .eq("id", SITE_ROW_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const apiKey = typeof data?.resend_api_key === "string" ? data.resend_api_key.trim() : "";
  const fromEmail =
    typeof data?.resend_from_email === "string" ? data.resend_from_email.trim() : "";
  const contactToEmail =
    typeof data?.contact_to_email === "string" ? data.contact_to_email.trim() : "";
  return {
    apiKey: apiKey.length > 0 ? apiKey : null,
    fromEmail: fromEmail.length > 0 ? fromEmail : null,
    contactToEmail: contactToEmail.length > 0 ? contactToEmail : null,
  };
}
