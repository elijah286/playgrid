"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { Button, Input, SegmentedControl } from "@/components/ui";
import { Card, CardBody } from "@/components/ui";
import { useToast } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [pending, setPending] = useState(false);

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
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
      }
      router.push("/playbooks");
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
