"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Gift, QrCode, Share2, X } from "lucide-react";
import { Button, Input, useToast } from "@/components/ui";
import { isNativeApp } from "@/lib/native/isNativeApp";
import { nativeShare } from "@/lib/native/share";
import { getReferralPromoAction } from "@/app/actions/share-promo";
import type { ReferralConfig } from "@/lib/site/referral-config";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

type Props = {
  userId: string | null;
  onClose: () => void;
};

/** Build the share URL. Logged-in users get attribution baked into the
 *  URL so any future signup-side referral handling can credit the right
 *  sender. Logged-out share is still valid — just untracked. */
function buildShareUrl(userId: string | null): string {
  return userId ? `${SITE_URL}/?ref=${encodeURIComponent(userId)}` : SITE_URL;
}

export function ShareDialog({ userId, onClose }: Props) {
  const { toast } = useToast();
  const [referral, setReferral] = useState<ReferralConfig | null>(null);
  const [tab, setTab] = useState<"link" | "qr">("link");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl = buildShareUrl(userId);

  useEffect(() => {
    let cancelled = false;
    getReferralPromoAction()
      .then((cfg) => {
        if (!cancelled) setReferral(cfg);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(shareUrl, {
      width: 320,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((d) => {
        if (!cancelled) setQrDataUrl(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  async function copy() {
    if (isNativeApp()) {
      const result = await nativeShare({
        title: "Try XO Gridmaker",
        text: "I'm using this for my playbook — thought you might like it.",
        url: shareUrl,
        dialogTitle: "Share XO Gridmaker",
      });
      if (result === "shared") return;
      if (result === "copied") {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Copy failed — select and copy the link manually.", "error");
    }
  }

  const promoActive = referral?.enabled === true;

  return (
    <div
      // The outer wrapper handles overflow: when the dialog is taller than
      // the viewport (small browser height + promo strip), it scrolls
      // instead of clipping the header off-screen. min-h-full + items-center
      // on the inner flex keeps the dialog vertically centered when it fits
      // and pins it to the top with natural scroll when it doesn't.
      className="fixed inset-0 z-[60] overflow-y-auto bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex min-h-full items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
              <Share2 className="size-4" />
              Share XO Gridmaker
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Send this to a coach who&rsquo;d find it useful.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {promoActive && referral && (
          <div className="flex items-start gap-3 border-b border-border bg-primary/5 px-5 py-3">
            <Gift className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 text-xs">
              <p className="font-semibold text-foreground">
                Get <span className="text-primary">{referral.daysPerAward} days</span> of Team
                Coach when they sign up and claim a copy from you.
              </p>
              <p className="mt-0.5 text-muted">
                {referral.capDays
                  ? `Up to ${referral.capDays} total days. No catch — they get the playbook, you get the months.`
                  : "Stack credits with every coach you bring in."}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4 p-5">
          <div className="flex gap-1 rounded-lg border border-border bg-surface-inset p-1">
            {(
              [
                { key: "link" as const, label: "Copy link", icon: Copy },
                { key: "qr" as const, label: "QR code", icon: QrCode },
              ]
            ).map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-surface-raised text-foreground shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {tab === "link" && (
            <div className="space-y-2">
              <Input
                value={shareUrl}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                onClick={copy}
                className="w-full"
                leftIcon={copied ? Check : Copy}
              >
                {copied ? "Copied!" : isNativeApp() ? "Share link" : "Copy link"}
              </Button>
              {!userId && (
                <p className="text-[11px] text-muted">
                  Sign in to attribute shares to you — useful when the give-and-get
                  program is on.
                </p>
              )}
            </div>
          )}

          {tab === "qr" && (
            <div className="flex flex-col items-center gap-2">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL
                <img
                  src={qrDataUrl}
                  alt="QR code for XO Gridmaker"
                  className="size-56 rounded-md border border-border bg-white"
                />
              ) : (
                <div className="flex size-56 items-center justify-center rounded-md border border-border bg-surface text-xs text-muted">
                  Generating QR…
                </div>
              )}
              <p className="text-center text-xs text-muted">
                Scan to open XO Gridmaker on another device.
              </p>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
