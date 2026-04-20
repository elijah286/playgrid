"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { CreditCard, IdCard, KeyRound, Monitor, Moon, Sun, UserCircle } from "lucide-react";
import {
  changePasswordAction,
  removeAvatarAction,
  updateDisplayNameAction,
  uploadAvatarAction,
} from "@/app/actions/account";
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
}: {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <NameCard initialDisplayName={displayName} />
      <PasswordCard />
      <AvatarCard email={email} displayName={displayName} avatarUrl={avatarUrl} />
      <PlanCard />
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

function PlanCard() {
  return (
    <Card icon={CreditCard} title="Plan" description="Billing lives here.">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">Free · Early access</p>
          <p className="mt-1 text-xs text-muted">
            Nothing to configure yet — PlayGrid is free while we&rsquo;re in early access.
          </p>
        </div>
        <button
          type="button"
          disabled
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted disabled:cursor-not-allowed"
          title="Coming soon"
        >
          Change plan
        </button>
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
  const inputRef = useRef<HTMLInputElement>(null);
  const initials = initialsFor(email, displayName);

  function onPick(file: File) {
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await uploadAvatarAction(fd);
      if (!res.ok) setMsg({ ok: false, text: res.error });
      else {
        setAvatarUrl(res.url);
        setMsg({ ok: true, text: "Avatar updated." });
      }
    });
  }

  return (
    <Card icon={UserCircle} title="Avatar" description="PNG, JPG, WebP, or GIF · up to 2 MB.">
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
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
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
    </Card>
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
