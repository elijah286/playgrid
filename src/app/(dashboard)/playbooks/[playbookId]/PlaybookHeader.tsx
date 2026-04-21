"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, CheckSquare, Copy, Home, Mail, MoreVertical, Plus, Printer, QrCode, Settings2, UserPlus, X } from "lucide-react";
import QRCode from "qrcode";
import {
  Button,
  Input,
  LogoPicker,
  SegmentedControl,
  useToast,
} from "@/components/ui";
import {
  renamePlaybookAction,
  updatePlaybookAppearanceAction,
  updatePlaybookSeasonAction,
  updatePlaybookSettingsAction,
} from "@/app/actions/playbooks";
import type { PlaybookSettings } from "@/domain/playbook/settings";
import { PlaybookRulesForm } from "@/features/playbooks/PlaybookRulesForm";
import {
  createInviteAction,
  sharePlaybookWithEmailsAction,
  type ShareResultRow,
} from "@/app/actions/invites";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.playgrid.us";

const PALETTE = [
  "#F26522", "#EF4444", "#EAB308", "#22C55E",
  "#3B82F6", "#A855F7", "#EC4899", "#1C1C1E",
];

function hexLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const toLin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

export type PlaybookHeaderPlayActions = {
  onNewPlay: () => void;
  onToggleSelect: () => void;
  selectionMode: boolean;
  creating: boolean;
  printHref: string;
  newFormationHref: string;
};

export function PlaybookHeader({
  playbookId,
  name,
  season,
  variantLabel,
  settings,
  logoUrl,
  accentColor,
  canManage,
  canShare,
  senderName,
  ownerDisplayName,
  playActions,
}: {
  playbookId: string;
  name: string;
  season: string | null;
  variantLabel: string;
  settings: PlaybookSettings;
  logoUrl: string | null;
  accentColor: string;
  canManage: boolean;
  canShare: boolean;
  senderName?: string | null;
  ownerDisplayName?: string | null;
  playActions?: PlaybookHeaderPlayActions;
}) {
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!canShare) return;
    if (searchParams?.get("share") === "1") {
      setInviteOpen(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("share");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    }
  }, [canShare, searchParams, router]);

  const isLightBg = hexLuminance(accentColor) > 0.55;
  const onAccent = isLightBg ? "text-slate-900" : "text-white";
  const onAccentMuted = isLightBg ? "text-slate-700" : "text-white/80";
  const onAccentHover = isLightBg ? "hover:bg-black/10" : "hover:bg-white/15";
  const gradient = `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 55%, ${accentColor}a8 100%)`;
  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <>
      <div
        className="relative -mx-6 -mt-3"
        style={{ background: gradient }}
      >
        <div className="relative mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
          <Link
            href="/home"
            className={`hidden sm:inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors ${onAccentMuted} ${onAccentHover}`}
            aria-label="Back to home"
          >
            <ArrowLeft className="size-4" />
            Home
          </Link>
          <div className={`hidden sm:block ${isLightBg ? "h-6 w-px bg-black/20" : "h-6 w-px bg-white/25"}`} />
          <div
            className={`relative size-9 sm:size-11 shrink-0 overflow-hidden rounded-lg sm:rounded-xl flex items-center justify-center text-base sm:text-lg font-extrabold ring-1 ${
              isLightBg ? "bg-white/80 ring-black/10" : "bg-white/20 ring-white/30"
            } ${onAccent}`}
          >
            {logoUrl ? (
              <Image src={logoUrl} alt="" fill className="object-contain p-1" sizes="44px" />
            ) : (
              <span>{initial}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className={`truncate text-base font-extrabold tracking-tight sm:text-2xl ${onAccent}`}>
              {name}
            </h1>
            <p className={`truncate text-[11px] font-medium sm:text-sm ${onAccentMuted}`}>
              {[
                season,
                variantLabel,
                ownerDisplayName ? `Shared by ${ownerDisplayName}` : senderName,
              ]
                .filter(Boolean)
                .join(" · ") || variantLabel}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Mobile-only PlayGrid brand chip. Desktop already shows the
                real SiteHeader; on mobile that header is hidden to save
                vertical space, so this chip keeps the brand present and
                doubles as a nav link back to /home. */}
            <Link
              href="/home"
              aria-label="PlayGrid home"
              className="sm:hidden inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-white ring-2 ring-white/90"
            >
              PlayGrid
            </Link>
            {canShare && (
              <Button
                size="sm"
                leftIcon={UserPlus}
                onClick={() => setInviteOpen(true)}
                className={`hidden sm:inline-flex ${
                  isLightBg
                    ? "!bg-slate-900 !text-white hover:!bg-slate-800"
                    : "!bg-white !text-slate-900 hover:!bg-white/90"
                }`}
              >
                Invite Team Member
              </Button>
            )}
            {(canShare || canManage || playActions) && (
              <HeaderMenu
                onAccent={onAccent}
                onAccentHover={onAccentHover}
                onCustomize={canManage ? () => setCustomizeOpen(true) : null}
                onInvite={canShare ? () => setInviteOpen(true) : null}
                playActions={playActions}
              />
            )}
          </div>
        </div>
      </div>

      {customizeOpen && (
        <CustomizeTeamDialog
          playbookId={playbookId}
          initialName={name}
          initialSeason={season ?? ""}
          initialLogoUrl={logoUrl ?? ""}
          initialColor={accentColor}
          initialSettings={settings}
          variantLabel={variantLabel}
          onClose={() => setCustomizeOpen(false)}
        />
      )}

      {inviteOpen && (
        <InviteTeamMemberDialog
          playbookId={playbookId}
          teamName={name}
          senderName={senderName ?? null}
          onClose={() => setInviteOpen(false)}
        />
      )}
    </>
  );
}

function HeaderMenu({
  onAccent,
  onAccentHover,
  onCustomize,
  onInvite,
  playActions,
}: {
  onAccent: string;
  onAccentHover: string;
  onCustomize: (() => void) | null;
  onInvite: (() => void) | null;
  playActions?: PlaybookHeaderPlayActions;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Team options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex size-9 items-center justify-center rounded-lg transition-colors ${onAccent} ${onAccentHover}`}
      >
        <MoreVertical className="size-5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[220px] overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-elevated"
        >
          <Link
            href="/home"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-inset sm:hidden"
          >
            <Home className="size-4" />
            <span>Home</span>
          </Link>
          {onInvite && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onInvite();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-inset sm:hidden"
            >
              <UserPlus className="size-4" />
              <span>Invite team member</span>
            </button>
          )}
          {playActions && (
            <>
              <div className="my-1 h-px bg-border sm:hidden" />
              <button
                type="button"
                role="menuitem"
                disabled={playActions.creating}
                onClick={() => {
                  setOpen(false);
                  playActions.onNewPlay();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-inset disabled:opacity-50 sm:hidden"
              >
                <Plus className="size-4" />
                <span>New play</span>
              </button>
              <Link
                href={playActions.newFormationHref}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-inset sm:hidden"
              >
                <Plus className="size-4" />
                <span>New formation</span>
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  playActions.onToggleSelect();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-inset sm:hidden"
              >
                <CheckSquare className="size-4" />
                <span>{playActions.selectionMode ? "Cancel selection" : "Select plays"}</span>
              </button>
              <Link
                href={playActions.printHref}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-inset sm:hidden"
              >
                <Printer className="size-4" />
                <span>Print playbook</span>
              </Link>
              <div className="my-1 h-px bg-border sm:hidden" />
            </>
          )}
          {onCustomize && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onCustomize();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-inset"
            >
              <Settings2 className="size-4" />
              <span>Customize team</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CustomizeTeamDialog({
  playbookId,
  initialName,
  initialSeason,
  initialLogoUrl,
  initialColor,
  initialSettings,
  variantLabel,
  onClose,
}: {
  playbookId: string;
  initialName: string;
  initialSeason: string;
  initialLogoUrl: string;
  initialColor: string;
  initialSettings: PlaybookSettings;
  variantLabel: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(initialName);
  const [season, setSeason] = useState(initialSeason);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [color, setColor] = useState(initialColor);
  const [settings, setSettings] = useState<PlaybookSettings>(initialSettings);
  const [saving, setSaving] = useState(false);

  const initials =
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 2) || "PB";

  async function save() {
    if (!name.trim()) {
      toast("Team name can't be empty.", "error");
      return;
    }
    setSaving(true);
    try {
      if (name.trim() !== initialName) {
        const r = await renamePlaybookAction(playbookId, name);
        if (!r.ok) {
          toast(r.error, "error");
          return;
        }
      }
      if (season.trim() !== (initialSeason ?? "").trim()) {
        const r = await updatePlaybookSeasonAction(playbookId, season);
        if (!r.ok) {
          toast(r.error, "error");
          return;
        }
      }
      if (color !== initialColor || (logoUrl || "") !== (initialLogoUrl || "")) {
        const r = await updatePlaybookAppearanceAction(playbookId, {
          logo_url: logoUrl || null,
          color: color || null,
        });
        if (!r.ok) {
          toast(r.error, "error");
          return;
        }
      }
      if (JSON.stringify(settings) !== JSON.stringify(initialSettings)) {
        const r = await updatePlaybookSettingsAction(playbookId, settings);
        if (!r.ok) {
          toast(r.error, "error");
          return;
        }
      }
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-bold text-foreground">Customize team</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div
            className="flex h-24 items-center justify-center rounded-lg"
            style={{ backgroundColor: color }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-16 w-16 object-contain" />
            ) : (
              <span className="text-3xl font-black tracking-tight text-white drop-shadow">
                {initials}
              </span>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Team name
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Season <span className="font-normal normal-case text-muted">(optional)</span>
            </label>
            <Input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="e.g. Spring 2026"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted">
              Team color
            </label>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => {
                const active = color.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                      active ? "border-foreground scale-110" : "border-border"
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                );
              })}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-full border-2 border-border"
                aria-label="Custom color"
              />
            </div>
          </div>

          <LogoPicker value={logoUrl} onChange={setLogoUrl} disabled={saving} />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted">
                Game type
              </label>
              <span className="text-xs text-muted">{variantLabel}</span>
            </div>
            <PlaybookRulesForm value={settings} onChange={setSettings} disabled={saving} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function InviteTeamMemberDialog({
  playbookId,
  teamName,
  senderName,
  onClose,
}: {
  playbookId: string;
  teamName: string;
  senderName: string | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<"choose" | "email" | "link">("choose");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [creating, setCreating] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkTab, setLinkTab] = useState<"link" | "qr">("link");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [sending, setSending] = useState(false);
  const [shareResults, setShareResults] = useState<ShareResultRow[] | null>(null);

  async function generate() {
    setCreating(true);
    const res = await createInviteAction({
      playbookId,
      role,
      expiresInDays: 14,
      maxUses: 25,
      email: null,
      note: null,
    });
    setCreating(false);
    if (!res.ok) {
      toast(`Could not create invite: ${res.error}`, "error");
      return;
    }
    const url = `${SITE_URL}/invite/${res.invite.token}`;
    setInviteUrl(url);
  }

  useEffect(() => {
    if (!inviteUrl) return;
    let cancelled = false;
    QRCode.toDataURL(inviteUrl, { width: 320, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((d) => {
        if (!cancelled) setQrDataUrl(d);
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [inviteUrl]);

  async function copy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Copy failed — select and copy the link manually.", "error");
    }
  }

  async function shareByEmails() {
    const emails = emailInput
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      toast("Enter at least one email.", "error");
      return;
    }
    setSending(true);
    const res = await sharePlaybookWithEmailsAction({
      playbookId,
      role,
      emails,
      teamName,
      senderName,
    });
    setSending(false);
    if (!res.ok) {
      toast(res.error, "error");
      return;
    }
    setShareResults(res.results);
    const added = res.results.filter((r) => r.kind === "added").length;
    const invited = res.results.filter((r) => r.kind === "invited").length;
    const already = res.results.filter((r) => r.kind === "already_member").length;
    const failed = res.results.filter((r) => r.kind === "failed").length;
    const bits: string[] = [];
    if (added) bits.push(`${added} added`);
    if (invited) bits.push(`${invited} invited`);
    if (already) bits.push(`${already} already a member`);
    if (failed) bits.push(`${failed} failed`);
    toast(bits.join(" · ") || "Done.", failed ? "error" : "success");
    if (added > 0) router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Invite team member</h2>
            <p className="mt-0.5 text-xs text-muted">Share a link, QR code, or email.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-inset hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {mode === "choose" && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setMode("email")}
                className="flex w-full items-start gap-3 rounded-lg border border-border bg-surface-inset p-4 text-left hover:border-primary hover:bg-primary/5"
              >
                <Mail className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <div className="text-sm font-semibold text-foreground">Share by email</div>
                  <p className="mt-0.5 text-xs text-muted">
                    Add one or more people by email. Existing users get instant access;
                    new users receive a sign-up link.
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode("link")}
                className="flex w-full items-start gap-3 rounded-lg border border-border bg-surface-inset p-4 text-left hover:border-primary hover:bg-primary/5"
              >
                <Copy className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <div className="text-sm font-semibold text-foreground">Create share link</div>
                  <p className="mt-0.5 text-xs text-muted">
                    Generate a link (or QR code) anyone can use to request access.
                    You still approve each person.
                  </p>
                </div>
              </button>
            </div>
          )}

          {mode === "email" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setMode("choose");
                  setShareResults(null);
                  setEmailInput("");
                }}
                className="-mt-1 flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
              >
                <ArrowLeft className="size-3" /> Back
              </button>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Role</label>
                <SegmentedControl
                  value={role}
                  onChange={(v) => setRole(v as "viewer" | "editor")}
                  options={[
                    { value: "viewer", label: "Player (view)" },
                    { value: "editor", label: "Coach (edit)" },
                  ]}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">
                  Emails
                </label>
                <textarea
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    setShareResults(null);
                  }}
                  placeholder="alex@example.com, jamie@example.com"
                  rows={3}
                  disabled={sending}
                  className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="mt-1 text-xs text-muted">
                  Separate with commas, spaces, or new lines.
                </p>
              </div>
              <Button
                variant="primary"
                leftIcon={Mail}
                onClick={shareByEmails}
                loading={sending}
                disabled={!emailInput.trim()}
                className="w-full"
              >
                Share playbook
              </Button>

              {shareResults && shareResults.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-border bg-surface-inset p-3 text-xs">
                  {shareResults.map((r) => (
                    <li key={r.email} className="flex items-center justify-between gap-2">
                      <span className="truncate text-foreground">{r.email}</span>
                      <span
                        className={
                          r.kind === "failed"
                            ? "shrink-0 text-danger"
                            : r.kind === "already_member"
                              ? "shrink-0 text-muted"
                              : "shrink-0 text-field"
                        }
                      >
                        {r.kind === "added"
                          ? "Added"
                          : r.kind === "invited"
                            ? "Invite sent"
                            : r.kind === "already_member"
                              ? "Already a member"
                              : `Failed: ${r.error}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {mode === "link" && !inviteUrl && (
            <>
              <button
                type="button"
                onClick={() => setMode("choose")}
                className="-mt-1 flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
              >
                <ArrowLeft className="size-3" /> Back
              </button>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted">Role</label>
                <SegmentedControl
                  value={role}
                  onChange={(v) => setRole(v as "viewer" | "editor")}
                  options={[
                    { value: "viewer", label: "Player (view)" },
                    { value: "editor", label: "Coach (edit)" },
                  ]}
                />
              </div>
              <p className="text-xs text-muted">
                We&apos;ll create a link valid for 14 days (up to 25 uses). You&apos;ll still
                approve each person after they sign up.
              </p>
              <Button variant="primary" onClick={generate} loading={creating} className="w-full">
                Create invite link
              </Button>
            </>
          )}

          {mode === "link" && inviteUrl && (
            <>
              <div className="flex gap-1 rounded-lg border border-border bg-surface-inset p-1">
                {(
                  [
                    { key: "link" as const, label: "Copy link", icon: Copy },
                    { key: "qr" as const, label: "QR code", icon: QrCode },
                  ]
                ).map((t) => {
                  const Icon = t.icon;
                  const active = linkTab === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setLinkTab(t.key)}
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

              {linkTab === "link" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-inset px-3 py-2">
                    <code className="flex-1 truncate text-xs text-foreground">{inviteUrl}</code>
                    <Button size="sm" variant="primary" leftIcon={copied ? Check : Copy} onClick={copy}>
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted">
                    Paste this anywhere — text, group chat, email. Anyone with the link can request to join.
                  </p>
                </div>
              )}

              {linkTab === "qr" && (
                <div className="flex flex-col items-center gap-3">
                  {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qrDataUrl}
                      alt="Invite QR code"
                      className="size-56 rounded-lg border border-border bg-white p-2"
                    />
                  ) : (
                    <div className="flex size-56 items-center justify-center rounded-lg border border-border bg-surface-inset text-xs text-muted">
                      Generating…
                    </div>
                  )}
                  <p className="text-center text-xs text-muted">
                    Scan with a phone camera to open the invite link.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
