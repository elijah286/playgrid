"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, CreditCard, IdCard, KeyRound, LogOut, Monitor, Moon, Smartphone, Sun, Users, UserCircle } from "lucide-react";
import {
  changePasswordAction,
  deleteOwnAccountAction,
  removeAvatarAction,
  revokeUserSessionAction,
  updateDisplayNameAction,
  uploadAvatarAction,
} from "@/app/actions/account";
import { createBillingPortalSessionAction, setSeatQuantityAction } from "@/app/actions/billing";
import { SEAT_PRICE_USD_PER_MONTH } from "@/lib/billing/seats-config";
import type { Entitlement } from "@/lib/billing/entitlement";
import { TIER_LABEL } from "@/lib/billing/features";
import type { SeatUsage, SeatCollaborator, PendingCoachInvite } from "@/lib/billing/seats";
import { resendCoachInviteAction } from "@/app/actions/invites";
import { removeCoachAccessAction } from "@/app/actions/playbook-roster";
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

export type AccountSession = {
  id: string;
  label: string;
  lastSeenAt: string;
  createdAt: string;
  ip: string | null;
  isCurrent: boolean;
};

export function AccountClient({
  email,
  displayName,
  avatarUrl,
  entitlement,
  sessions,
  seatUsage,
  seatCollaborators,
  pendingCoachInvites,
}: {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  entitlement: Entitlement | null;
  sessions: AccountSession[];
  seatUsage: SeatUsage | null;
  seatCollaborators: SeatCollaborator[];
  pendingCoachInvites: PendingCoachInvite[];
}) {
  return (
    <div className="space-y-10">
      <Section
        title="Profile"
        description="How you appear to teammates and on shared playsheets."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <NameCard initialDisplayName={displayName} />
          <AvatarCard email={email} displayName={displayName} avatarUrl={avatarUrl} />
        </div>
      </Section>

      <Section
        title="Subscription"
        description="Your plan, billing, and the coaches you've granted access to."
      >
        <div className="space-y-4">
          <PlanCard entitlement={entitlement} />
          {seatUsage ? (
            <SeatsCard
              usage={seatUsage}
              collaborators={seatCollaborators}
              pendingInvites={pendingCoachInvites}
              canPurchase={entitlement?.source === "stripe"}
              isComplimentary={entitlement?.source === "comp"}
            />
          ) : null}
        </div>
      </Section>

      <Section
        title="Security"
        description="Password and devices currently signed in to your account."
      >
        <div className="space-y-4">
          <PasswordCard />
          <SessionsCard sessions={sessions} />
        </div>
      </Section>

      <Section title="Preferences" description="Customize how xogridmaker looks.">
        <AppearanceCard />
      </Section>

      <Section title="Danger zone" tone="danger">
        <DeleteAccountCard hasPaidPlan={entitlement?.source === "stripe"} />
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  tone,
  children,
}: {
  title: string;
  description?: string;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
      <div>
        <h2
          className={cn(
            "text-base font-semibold",
            tone === "danger" ? "text-danger" : "text-foreground",
          )}
        >
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-xs text-muted">{description}</p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function DeleteAccountCard({ hasPaidPlan }: { hasPaidPlan: boolean }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const matches = confirmText.trim().toLowerCase() === "delete";

  function onDelete() {
    setErr(null);
    startTransition(async () => {
      const res = await deleteOwnAccountAction();
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      // Hard navigation so the cleared session cookie takes effect.
      window.location.assign("/");
    });
  }

  return (
    <section className="rounded-2xl border border-danger/40 bg-danger-light/40 p-6">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-danger" />
        <h2 className="text-sm font-semibold text-foreground">Delete account</h2>
      </div>
      <p className="mt-1 text-xs text-muted">
        Permanently delete your xogridmaker account and everything in it —
        playbooks, plays, formations, and settings. This cannot be undone.
      </p>
      {hasPaidPlan && (
        <p className="mt-3 rounded-md bg-warning-light px-3 py-2 text-xs text-warning ring-1 ring-warning/30">
          You have an active paid subscription. Cancel it from the Plan card
          above before deleting your account, or you may continue to be billed.
        </p>
      )}
      {!confirmOpen ? (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="mt-4 rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger hover:text-white"
        >
          Delete my account
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-xs">
            <span className="text-foreground">Type DELETE to confirm:</span>
            <input
              type="text"
              autoComplete="off"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              placeholder="DELETE"
            />
          </label>
          {err && <p className="text-xs text-danger">{err}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDelete}
              disabled={!matches || pending}
              className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Deleting…" : "Permanently delete"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmOpen(false);
                setConfirmText("");
                setErr(null);
              }}
              disabled={pending}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
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
      description="Shown on invites, playsheets, and throughout xogridmaker."
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
              data-web-only
              className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface disabled:opacity-50"
            >
              Manage billing
            </button>
          ) : (
            <Link
              href="/pricing"
              data-web-only
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
            >
              {tier === "free" ? "See pricing" : "Change plan"}
            </Link>
          )}
        </div>

        {isComp ? (
          <p className="rounded-md bg-surface px-3 py-2 text-xs text-muted ring-1 ring-border">
            You have a complimentary {TIER_LABEL[tier]} subscription — thank you for being an
            early user. No action needed.
          </p>
        ) : null}

        {err ? <p className="text-xs text-red-700">{err}</p> : null}
      </div>
    </Card>
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

function SessionsCard({ sessions }: { sessions: AccountSession[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function revoke(id: string) {
    setErr(null);
    setPendingId(id);
    startTransition(async () => {
      const res = await revokeUserSessionAction({ sessionId: id });
      setPendingId(null);
      if (!res.ok) setErr(res.error);
      else window.location.reload();
    });
  }

  return (
    <Card
      icon={Smartphone}
      title="Active sessions"
      description="Devices currently signed in to this account. Sign out anything you don't recognize."
    >
      {sessions.length === 0 ? (
        <p className="text-xs text-muted">No active sessions.</p>
      ) : (
        <ul className="divide-y divide-border">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span className="truncate">{s.label}</span>
                  {s.isCurrent && (
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-800">
                      This device
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  Last active {formatRelative(s.lastSeenAt)}
                  {s.ip ? ` · ${s.ip}` : ""}
                </div>
              </div>
              {!s.isCurrent && (
                <button
                  type="button"
                  disabled={pendingId === s.id}
                  onClick={() => revoke(s.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-50"
                >
                  <LogOut className="size-3.5" />
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </Card>
  );
}

function SeatsCard({
  usage,
  collaborators,
  pendingInvites,
  canPurchase,
  isComplimentary,
}: {
  usage: SeatUsage;
  collaborators: SeatCollaborator[];
  pendingInvites: PendingCoachInvite[];
  canPurchase: boolean;
  isComplimentary: boolean;
}) {
  const total = usage.included + usage.purchased;
  const pct = total === 0 ? 0 : Math.min(100, Math.round((usage.used / total) * 100));
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const minRemovable = Math.max(0, usage.used - usage.included);
  const canAdjustSeats = canPurchase || isComplimentary;

  function setSeats(next: number) {
    setErr(null);
    startTransition(async () => {
      const res = await setSeatQuantityAction({ nextPurchased: next });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      window.location.reload();
    });
  }

  async function removeCoach(userId: string, label: string) {
    if (
      !window.confirm(
        `Remove ${label} from every playbook you own? They'll lose edit access immediately and the seat opens up.`,
      )
    ) {
      return;
    }
    setErr(null);
    setRemovingUserId(userId);
    const res = await removeCoachAccessAction(userId);
    setRemovingUserId(null);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    window.location.reload();
  }

  async function resend(inviteId: string) {
    setErr(null);
    setResendNotice(null);
    setResending(inviteId);
    const res = await resendCoachInviteAction(inviteId);
    setResending(null);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setResendNotice("Invite re-sent.");
  }

  return (
    <Card
      icon={Users}
      title="Coach seats"
      description="Coaches you've granted edit access to. Players are unlimited and don't use a seat."
    >
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-foreground">
            {usage.used} of {total} coach seat{total === 1 ? "" : "s"} used
          </p>
          <p className="text-xs text-muted">
            {usage.included} included
            {usage.purchased > 0 ? ` + ${usage.purchased} added` : ""}
          </p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-inset">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        {collaborators.some((c) => !c.consumesSeat) ? (
          <p className="text-xs text-muted">
            Coaches with their own paid plan don&rsquo;t use one of your seats.
          </p>
        ) : null}
        {collaborators.length === 0 ? (
          <p className="text-xs text-muted">
            No coaches yet. Invite a coach with edit access from any playbook.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {collaborators.map((c) => {
              const manageHref =
                c.playbookIds.length === 1
                  ? `/playbooks/${c.playbookIds[0]}?tab=roster`
                  : c.playbookIds.length > 1
                  ? "/playbooks"
                  : null;
              return (
                <li key={c.userId} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {c.displayName ?? c.email ?? "Unknown user"}
                      </span>
                      {!c.consumesSeat ? (
                        <span
                          title="This coach has their own paid plan, so they don't use one of your seats."
                          className="shrink-0 rounded-full bg-success-light px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success ring-1 ring-success/30"
                        >
                          Free
                        </span>
                      ) : null}
                    </div>
                    {c.displayName && c.email ? (
                      <div className="truncate text-xs text-muted">{c.email}</div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                    <span>
                      {c.playbookCount} playbook{c.playbookCount === 1 ? "" : "s"}
                    </span>
                    {manageHref ? (
                      <Link
                        href={manageHref}
                        className="font-medium text-foreground hover:underline"
                      >
                        Manage
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      disabled={removingUserId === c.userId}
                      onClick={() =>
                        removeCoach(
                          c.userId,
                          c.displayName ?? c.email ?? "this coach",
                        )
                      }
                      className="font-medium text-danger hover:underline disabled:opacity-50"
                    >
                      {removingUserId === c.userId ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {pendingInvites.length > 0 ? (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium text-foreground">
              Pending coach invites
            </p>
            <ul className="mt-1 divide-y divide-border">
              {pendingInvites.map((inv) => (
                <li key={inv.inviteId} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-foreground">
                      {inv.email ?? "(link-only invite)"}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {inv.playbookName}
                    </div>
                  </div>
                  {inv.email ? (
                    <button
                      type="button"
                      disabled={resending === inv.inviteId}
                      onClick={() => resend(inv.inviteId)}
                      className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-50"
                    >
                      {resending === inv.inviteId ? "Sending…" : "Resend"}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {resendNotice ? <p className="text-xs text-success">{resendNotice}</p> : null}
        {canAdjustSeats ? (
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <p className="text-xs text-muted">
              {isComplimentary
                ? "Adjust your coach seats — your complimentary plan covers them, no charge."
                : `Add coach seats for $${SEAT_PRICE_USD_PER_MONTH}/seat/month, prorated.`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pending || usage.purchased <= minRemovable}
                onClick={() => setSeats(usage.purchased - 1)}
                className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-50"
              >
                − Remove
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setSeats(usage.purchased + 1)}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-50"
              >
                + Add seat
              </button>
            </div>
          </div>
        ) : null}
        {err ? <p className="text-xs text-red-600">{err}</p> : null}
      </div>
    </Card>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "recently";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}
