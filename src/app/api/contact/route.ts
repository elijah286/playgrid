import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getStoredResendConfig } from "@/lib/site/resend-config";

const TO_EMAIL = "Elijah.Kerry@gmail.com";
const DEFAULT_FROM_EMAIL = "PlayGrid <onboarding@resend.dev>";

export async function POST(req: Request) {
  let body: { name?: unknown; email?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Name, email, and message are required" }, { status: 400 });
  }
  if (name.length > 120 || email.length > 200 || message.length > 5000) {
    return NextResponse.json({ error: "Input exceeds allowed length" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  let apiKey: string | null = null;
  let fromEmail: string = DEFAULT_FROM_EMAIL;
  try {
    const cfg = await getStoredResendConfig();
    apiKey = cfg.apiKey;
    if (cfg.fromEmail) fromEmail = cfg.fromEmail;
  } catch {
    /* fall through to env fallback */
  }
  if (!apiKey) apiKey = process.env.RESEND_API_KEY ?? null;
  if (fromEmail === DEFAULT_FROM_EMAIL && process.env.RESEND_FROM_EMAIL) {
    fromEmail = process.env.RESEND_FROM_EMAIL;
  }

  if (!apiKey) {
    return NextResponse.json(
      { error: "Email service is not configured. Please try again later." },
      { status: 503 },
    );
  }

  const resend = new Resend(apiKey);
  const safeMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  try {
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: TO_EMAIL,
      replyTo: email,
      subject: "Feedback",
      text: `From: ${name} <${email}>\n\n${message}`,
      html: `<p><strong>From:</strong> ${name} &lt;${email}&gt;</p><p style="white-space:pre-wrap">${safeMessage}</p>`,
    });
    if (error) {
      return NextResponse.json({ error: error.message ?? "Failed to send" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send" },
      { status: 502 },
    );
  }
}
