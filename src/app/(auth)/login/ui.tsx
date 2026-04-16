"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export function LoginForm() {
  const router = useRouter();
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
      router.push("/playbooks");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  if (!hasSupabaseEnv()) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
        Add <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
        <code className="font-mono">.env.local</code>, then restart the dev server.
      </p>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl bg-white p-6 ring-1 ring-slate-200/80">
      <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${
            mode === "signin" ? "bg-white shadow-sm" : "text-slate-600"
          }`}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${
            mode === "signup" ? "bg-white shadow-sm" : "text-slate-600"
          }`}
          onClick={() => setMode("signup")}
        >
          Create account
        </button>
      </div>
      <label className="block text-sm">
        <span className="text-slate-600">Email</span>
        <input
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="text-slate-600">Password</span>
        <input
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
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
        className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Working…" : mode === "signin" ? "Sign in" : "Sign up"}
      </button>
    </div>
  );
}
