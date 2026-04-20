"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { Button, Input, Card, CardBody, useToast } from "@/components/ui";
import { PASSWORD_RULES_LABEL, validatePassword } from "@/lib/auth/password";

type Stage = "exchanging" | "ready" | "no-session" | "done";

export function ResetPasswordForm() {
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [stage, setStage] = useState<Stage>("exchanging");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);

  // Supabase sends either ?code=... (PKCE) or a #access_token=... hash.
  // Try to exchange the code for a session; if that fails, check whether a
  // session was already established (hash-based flow auto-applies).
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!hasSupabaseEnv()) {
        if (!cancelled) {
          setStage("no-session");
          setError("Supabase is not configured.");
        }
        return;
      }
      const supabase = createClient();
      const code = searchParams.get("code");
      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        if (data.user) {
          setStage("ready");
        } else {
          setStage("no-session");
          setError(
            "This password-reset link is no longer valid. Request a new one from the sign-in page.",
          );
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setStage("no-session");
        setError(
          e instanceof Error
            ? e.message
            : "This password-reset link is no longer valid.",
        );
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const pwError = password.length > 0 ? validatePassword(password) : null;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = !pending && !validatePassword(password) && password === confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setStage("done");
      toast("Password updated. You're signed in.", "success");
      router.push("/home");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not update password.");
    } finally {
      setPending(false);
    }
  }

  if (stage === "exchanging") {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-muted">Verifying your reset link…</p>
        </CardBody>
      </Card>
    );
  }

  if (stage === "no-session") {
    return (
      <Card>
        <CardBody className="space-y-3">
          <p className="text-sm text-danger">{error ?? "Invalid or expired reset link."}</p>
          <Button
            variant="primary"
            className="w-full"
            onClick={() => router.push("/login")}
          >
            Back to sign-in
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-foreground">New password</span>
            <Input
              type="password"
              autoComplete="new-password"
              leftIcon={Lock}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-foreground">Confirm password</span>
            <Input
              type="password"
              autoComplete="new-password"
              leftIcon={Lock}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </label>
          <p className="text-xs text-muted">{PASSWORD_RULES_LABEL}</p>
          {pwError && <p className="text-xs text-amber-600">{pwError}</p>}
          {mismatch && <p className="text-xs text-amber-600">Passwords do not match.</p>}
          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={pending}
            disabled={!canSubmit}
          >
            Update password
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
