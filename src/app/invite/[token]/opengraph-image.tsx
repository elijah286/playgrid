import { ImageResponse } from "next/og";
import { previewInviteAction } from "@/app/actions/invites";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { SPORT_VARIANT_LABELS } from "@/domain/play/factory";
import type { SportVariant } from "@/domain/play/types";

export const runtime = "nodejs";
export const alt = "PlayGrid playbook invite";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = { params: Promise<{ token: string }> };

export default async function InviteOgImage({ params }: Props) {
  const { token } = await params;
  const fallback = () =>
    new ImageResponse(
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
            fontSize: 64,
            fontWeight: 800,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          PlayGrid
        </div>
      ),
      { ...size },
    );

  if (!hasSupabaseEnv()) return fallback();
  const res = await previewInviteAction(token);
  if (!res.ok || res.preview.revoked || res.preview.expired) return fallback();
  const p = res.preview;

  const team = p.team_name?.trim() || p.playbook_name;
  const variantLabel = p.sport_variant
    ? SPORT_VARIANT_LABELS[p.sport_variant as SportVariant]
    : null;
  const subParts = [variantLabel, p.season].filter(Boolean) as string[];
  const subline = subParts.join(" · ");
  const accent = p.color || "#2563eb";

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
            fontSize: 28,
            fontWeight: 700,
            color: "rgba(255,255,255,0.85)",
          }}
        >
          PlayGrid
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
            {p.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.logo_url}
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
                {team.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: "rgba(255,255,255,0.65)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              You&rsquo;re invited to the Playbook for
            </div>
            <div
              style={{
                fontSize: 68,
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
              }}
            >
              {team}
            </div>
            {subline && (
              <div
                style={{
                  fontSize: 30,
                  color: "rgba(255,255,255,0.75)",
                }}
              >
                {subline}
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
          <span>playgrid.us</span>
          <span>{p.play_count} plays</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
