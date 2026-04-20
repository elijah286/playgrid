"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Lock, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { afterSignupSyncRoleAction } from "@/app/actions/coach-invitations";
import { Button, Input, SegmentedControl } from "@/components/ui";
import { Card, CardBody } from "@/components/ui";
import { useToast } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const urlInvite = searchParams.get("invite")?.trim() ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">(urlInvite ? "signup" : "signin");
  const [inviteCode, setInviteCode] = useState(urlInvite.toUpperCase());
  const [showInviteField, setShowInviteField] = useState(Boolean(urlInvite));
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (urlInvite) {
      setInviteCode(urlInvite.toUpperCase());
      setShowInviteField(true);
      setMode("signup");
    }
  }, [urlInvite]);

  async function submit() {
    setPending(true);
    try {
      if (!hasSupabaseEnv()) {
        throw new Error("Supabase is not configured. Add .env.local keys.");
      }
      const supabase = createClient();
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        const trimmedCode = inviteCode.trim().toUpperCase();
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: trimmedCode
            ? { data: { invite_code: trimmedCode } }
            : undefined,
        });
        if (err) throw err;

        if (data.session) {
          const res = await afterSignupSyncRoleAction();
          if (res.ok && res.role === "coach") {
            toast("Your coach account is ready.", "success");
          } else if (trimmedCode && res.ok && res.role !== "coach") {
            toast("Account created, but that invite code was invalid or already used.", "error");
          }
        } else if (trimmedCode) {
          toast(
            "Check your email to confirm your account. Your coach access activates after you sign in.",
            "success",
          );
        }
      }
      router.push("/home");
      router.refresh();
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Something went wrong", "error");
    } finally {
      setPending(false);
    }
  }

  if (!hasSupabaseEnv()) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-warning">
            Add <code className="rounded bg-warning-light px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
            and{" "}
            <code className="rounded bg-warning-light px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
            to <code className="rounded bg-warning-light px-1.5 py-0.5 font-mono text-xs">.env.local</code>, then restart.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="space-y-5">
        <SegmentedControl
          options={[
            { value: "signin" as const, label: "Sign in" },
            { value: "signup" as const, label: "Create account" },
          ]}
          value={mode}
          onChange={setMode}
          className="w-full [&>button]:flex-1"
        />
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-foreground">Email</span>
            <Input
              type="email"
              autoComplete="email"
              leftIcon={Mail}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-foreground">Password</span>
            <Input
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              leftIcon={Lock}
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {mode === "signup" && (
            showInviteField ? (
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-foreground">
                  Invite code <span className="text-xs font-normal text-muted">(for coaches)</span>
                </span>
                <Input
                  type="text"
                  autoComplete="off"
                  leftIcon={Ticket}
                  placeholder="COACH-XXXXXXXXXX"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="font-mono uppercase tracking-wide"
                />
              </label>
            ) : (
              <button
                type="button"
                onClick={() => setShowInviteField(true)}
                className="text-xs font-medium text-primary hover:text-primary-hover"
              >
                Have an invite code?
              </button>
            )
          )}
        </div>
        <Button
          variant="primary"
          className="w-full"
          loading={pending}
          onClick={submit}
        >
          {mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </CardBody>
    </Card>
  );
}
