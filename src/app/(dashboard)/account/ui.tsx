"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { CreditCard, IdCard, KeyRound, Monitor, Moon, Sun, UserCircle } from "lucide-react";
import {
  changePasswordAction,
  removeAvatarAction,
  updateDisplayNameAction,
  uploadAvatarAction,
} from "@/app/actions/account";
import {
  createBillingPortalSessionAction,
  createCheckoutSessionAction,
} from "@/app/actions/billing";
import type { Entitlement } from "@/lib/billing/entitlement";
import { TIER_LABEL, TIER_PRICE } from "@/lib/billing/features";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { ColorSchemePreference } from "@/components/theme/colorModeStorage";
import { cn } from "@/lib/utils";
import { PASSWORD_RULES_LABEL, validatePassword } from "@/lib/auth/password";

const THEME_OPTIONS: { value: ColorSchemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function initialsFor(email: string, displayName: string | null): string {
  const source = displayName?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

export function AccountClient({
  email,
  displayName,
  avatarUrl,
  entitlement,
}: {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  entitlement: Entitlement | null;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <NameCard initialDisplayName={displayName} />
      <PasswordCard />
      <AvatarCard email={email} displayName={displayName} avatarUrl={avatarUrl} />
      <PlanCard entitlement={entitlement} />
      <AppearanceCard />
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Sun;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface-raised p-6">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {description && <p className="mt-1 text-xs text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function NameCard({ initialDisplayName }: { initialDisplayName: string | null }) {
  const [name, setName] = useState(initialDisplayName ?? "");
  const [savedName, setSavedName] = useState(initialDisplayName ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const trimmed = name.trim();
  const dirty = trimmed !== (savedName ?? "").trim();
  const disabled = pending || !dirty;

  return (
    <Card
      icon={IdCard}
      title="Display name"
      description="Shown on invites, playsheets, and throughout PlayGrid."
    >
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="text-muted">Your name</span>
          <input
            type="text"
            autoComplete="name"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Coach Smith"
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
          />
        </label>
        {msg && (
          <p className={cn("text-xs", msg.ok ? "text-emerald-600" : "text-red-600")}>{msg.text}</p>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setMsg(null);
            startTransition(async () => {
              const res = await updateDisplayNameAction({ displayName: trimmed });
              if (!res.ok) setMsg({ ok: false, text: res.error });
              else {
                setSavedName(res.displayName ?? "");
                setName(res.displayName ?? "");
                setMsg({ ok: true, text: "Name updated." });
              }
            });
          }}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save name"}
        </button>
      </div>
    </Card>
  );
}

function PasswordCard() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const pwError = pw.length > 0 ? validatePassword(pw) : null;
  const mismatch = confirm.length > 0 && pw !== confirm;
  const disabled = pending || !!validatePassword(pw) || pw !== confirm;

  return (
    <Card icon={KeyRound} title="Change password" description={PASSWORD_RULES_LABEL}>
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="text-muted">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">Confirm password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground"
          />
        </label>
        {pwError && <p className="text-xs text-amber-600">{pwError}</p>}
        {mismatch && <p className="text-xs text-amber-600">Passwords do not match.</p>}
        {msg && (
          <p className={cn("text-xs", msg.ok ? "text-emerald-600" : "text-red-600")}>{msg.text}</p>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setMsg(null);
            startTransition(async () => {
              const res = await changePasswordAction({ password: pw });
              if (!res.ok) setMsg({ ok: false, text: res.error });
              else {
                setMsg({ ok: true, text: "Password updated." });
                setPw("");
                setConfirm("");
              }
            });
          }}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Update password"}
        </button>
      </div>
    </Card>
  );
}

function PlanCard({ entitlement }: { entitlement: Entitlement | null }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const tier = entitlement?.tier ?? "free";
  const source = entitlement?.source ?? "free";
  const isPaid = source === "stripe";
  const isComp = source === "comp";
  const showUpgradeOptions = tier === "free";

  function checkout(t: "coach" | "coach_ai", interval: "month" | "year") {
    setErr(null);
    startTransition(async () => {
      const res = await createCheckoutSessionAction({ tier: t, interval });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      window.location.href = res.url;
    });
  }

  function openPortal() {
    setErr(null);
    startTransition(async () => {
      const res = await createBillingPortalSessionAction();
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      window.location.href = res.url;
    });
  }

  return (
    <Card icon={CreditCard} title="Plan" description="Your subscription and billing.">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">
              {TIER_LABEL[tier]}
              {isComp ? " · complimentary" : null}
              {isPaid ? " · paid" : null}
            </p>
            {entitlement?.expiresAt ? (
              <p className="mt-1 text-xs text-muted">
                {isComp ? "Expires" : "Renews / ends"}:{" "}
                {new Date(entitlement.expiresAt).toLocaleDateString()}
              </p>
            ) : null}
          </div>
          {isPaid ? (
            <button
              type="button"
              onClick={openPortal}
              disabled={pending}
              className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface disabled:opacity-50"
            >
              Manage billing
            </button>
          ) : null}
        </div>

        {isComp ? (
          <p className="rounded-md bg-surface px-3 py-2 text-xs text-muted ring-1 ring-border">
            You have a complimentary {TIER_LABEL[tier]} subscription — thank you for being an
            early user. No action needed.
          </p>
        ) : null}

        {showUpgradeOptions ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <PlanOption
              label="Coach · monthly"
              price={`$${TIER_PRICE.coach.month}/mo`}
              onClick={() => checkout("coach", "month")}
              disabled={pending}
            />
            <PlanOption
              label="Coach · annual"
              price={`$${TIER_PRICE.coach.year}/yr`}
              onClick={() => checkout("coach", "year")}
              disabled={pending}
              hint="Save ~8%"
            />
            <PlanOption
              label="Coach AI · monthly"
              price={`$${TIER_PRICE.coach_ai.month}/mo`}
              onClick={() => checkout("coach_ai", "month")}
              disabled={pending}
            />
            <PlanOption
              label="Coach AI · annual"
              price={`$${TIER_PRICE.coach_ai.year}/yr`}
              onClick={() => checkout("coach_ai", "year")}
              disabled={pending}
            />
          </div>
        ) : null}

        {err ? <p className="text-xs text-red-700">{err}</p> : null}
      </div>
    </Card>
  );
}

function PlanOption({
  label,
  price,
  onClick,
  disabled,
  hint,
}: {
  label: string;
  price: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-surface disabled:opacity-50"
    >
      <span>
        <span className="block font-medium text-foreground">{label}</span>
        {hint ? <span className="block text-[11px] text-muted">{hint}</span> : null}
      </span>
      <span className="text-sm font-semibold text-foreground">{price}</span>
    </button>
  );
}

function AvatarCard({
  email,
  displayName,
  avatarUrl: initial,
}: {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}) {
  const [avatarUrl, setAvatarUrl] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initials = initialsFor(email, displayName);

  function uploadBlob(blob: Blob) {
    const fd = new FormData();
    const jpg = new File([blob], "avatar.jpg", { type: "image/jpeg" });
    fd.append("file", jpg);
    startTransition(async () => {
      const res = await uploadAvatarAction(fd);
      if (!res.ok) setMsg({ ok: false, text: res.error });
      else {
        setAvatarUrl(res.url);
        setMsg({ ok: true, text: "Avatar updated." });
        setPendingFile(null);
      }
    });
  }

  return (
    <Card icon={UserCircle} title="Avatar" description="Drag to reposition and zoom before uploading.">
      <div className="flex items-center gap-4">
        <div className="relative size-16 overflow-hidden rounded-full bg-primary text-lg font-bold text-white">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt="Avatar"
              fill
              sizes="64px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex size-full items-center justify-center">{initials}</div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setMsg(null);
                setPendingFile(f);
              }
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Uploading…" : avatarUrl ? "Replace" : "Upload"}
          </button>
          {avatarUrl && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setMsg(null);
                startTransition(async () => {
                  const res = await removeAvatarAction();
                  if (!res.ok) setMsg({ ok: false, text: res.error });
                  else {
                    setAvatarUrl(null);
                    setMsg({ ok: true, text: "Avatar removed." });
                  }
                });
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {msg && (
        <p className={cn("mt-3 text-xs", msg.ok ? "text-emerald-600" : "text-red-600")}>
          {msg.text}
        </p>
      )}
      {pendingFile && (
        <AvatarCropperDialog
          file={pendingFile}
          saving={pending}
          onCancel={() => setPendingFile(null)}
          onConfirm={uploadBlob}
          onError={(text) => {
            setMsg({ ok: false, text });
            setPendingFile(null);
          }}
        />
      )}
    </Card>
  );
}

const CROP_DISPLAY = 288;
const EXPORT_SIZE = 512;

function AvatarCropperDialog({
  file,
  saving,
  onCancel,
  onConfirm,
  onError,
}: {
  file: File;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
  onError: (message: string) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new window.Image();
    i.onload = () => {
      const s = CROP_DISPLAY / Math.min(i.naturalWidth, i.naturalHeight);
      setImg(i);
      setScale(s);
      setTx(0);
      setTy(0);
    };
    i.onerror = () => onError("Could not read that image. Try a different file.");
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, onError]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.clearRect(0, 0, CROP_DISPLAY, CROP_DISPLAY);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CROP_DISPLAY, CROP_DISPLAY);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const cx = CROP_DISPLAY / 2 + tx;
    const cy = CROP_DISPLAY / 2 + ty;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
  }, [img, scale, tx, ty]);

  useEffect(() => {
    draw();
  }, [draw]);

  const minScale = img
    ? Math.max(CROP_DISPLAY / Math.max(img.naturalWidth, img.naturalHeight), 0.02)
    : 0.02;
  const fitScale = img ? CROP_DISPLAY / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const maxScale = fitScale * 5;

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    setTx(dragRef.current.tx + (e.clientX - dragRef.current.x));
    setTy(dragRef.current.ty + (e.clientY - dragRef.current.y));
  }
  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }

  async function confirm() {
    if (!img) return;
    const out = document.createElement("canvas");
    out.width = EXPORT_SIZE;
    out.height = EXPORT_SIZE;
    const ctx = out.getContext("2d");
    if (!ctx) {
      onError("Could not prepare image for upload.");
      return;
    }
    const k = EXPORT_SIZE / CROP_DISPLAY;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
    ctx.imageSmoothingQuality = "high";
    const w = img.naturalWidth * scale * k;
    const h = img.naturalHeight * scale * k;
    const cx = EXPORT_SIZE / 2 + tx * k;
    const cy = EXPORT_SIZE / 2 + ty * k;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      out.toBlob((b) => resolve(b), "image/jpeg", 0.85),
    );
    if (!blob) {
      onError("Could not encode image for upload.");
      return;
    }
    onConfirm(blob);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface-raised p-5 shadow-elevated">
        <h2 className="text-base font-bold text-foreground">Crop avatar</h2>
        <p className="mt-1 text-xs text-muted">Drag to reposition. Use the slider to zoom.</p>
        <div className="mt-4 flex justify-center">
          <div
            className="relative rounded-full bg-surface-inset"
            style={{ width: CROP_DISPLAY, height: CROP_DISPLAY }}
          >
            <canvas
              ref={canvasRef}
              width={CROP_DISPLAY}
              height={CROP_DISPLAY}
              className="block cursor-move touch-none rounded-full"
              style={{ width: CROP_DISPLAY, height: CROP_DISPLAY }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-primary/60" />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-xs text-muted">Zoom</label>
          <input
            type="range"
            min={minScale}
            max={maxScale}
            step={0.001}
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="mt-1 w-full accent-primary"
            disabled={!img || saving}
          />
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={saving || !img}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AppearanceCard() {
  const { colorScheme, setColorScheme } = useTheme();
  return (
    <Card icon={Monitor} title="Site appearance" description="Defaults to your system setting.">
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-surface-inset p-1">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = colorScheme === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setColorScheme(value)}
              aria-pressed={active}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md px-2 py-2 text-xs font-medium transition-colors",
                active
                  ? "bg-surface-raised text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
