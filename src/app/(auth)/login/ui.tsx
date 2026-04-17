"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
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
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
      }
      await supabase.auth.getSession();
      window.location.assign("/playbooks");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  if (!hasSupabaseEnv()) {
    return (
      <p className="rounded-xl bg-pg-signal-soft px-4 py-3 text-sm text-pg-signal-deep ring-1 ring-pg-signal-ring/80">
        Add <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
        <code className="font-mono">.env.local</code>, then restart the dev server.
      </p>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl bg-pg-chalk p-6 ring-1 ring-pg-line/80 dark:bg-pg-turf-deep/30">
      <div className="flex gap-2 rounded-xl bg-pg-surface p-1 dark:bg-pg-chalk/20">
        <button
          type="button"
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${
            mode === "signin" ? "bg-pg-chalk shadow-sm dark:bg-pg-mist" : "text-pg-muted"
          }`}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${
            mode === "signup" ? "bg-pg-chalk shadow-sm dark:bg-pg-mist" : "text-pg-muted"
          }`}
          onClick={() => setMode("signup")}
        >
          Create account
        </button>
      </div>
      <label className="block text-sm">
        <span className="text-pg-muted">Email</span>
        <input
          className="mt-1 w-full rounded-xl border border-pg-line bg-pg-chalk px-3 py-2 dark:bg-pg-chalk/10"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="text-pg-muted">Password</span>
        <input
          className="mt-1 w-full rounded-xl border border-pg-line bg-pg-chalk px-3 py-2 dark:bg-pg-chalk/10"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="w-full rounded-xl bg-pg-turf py-2.5 text-sm font-medium text-white hover:bg-pg-turf-deep disabled:opacity-60"
      >
        {pending ? "Working…" : mode === "signin" ? "Sign in" : "Sign up"}
      </button>
    </div>
  );
}
