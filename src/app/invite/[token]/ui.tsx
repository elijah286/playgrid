"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptInviteAction } from "@/app/actions/invites";
import { Button, useToast } from "@/components/ui";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);

  async function accept() {
    setPending(true);
    const res = await acceptInviteAction(token);
    setPending(false);
    if (!res.ok) {
      toast(`Could not accept invite: ${res.error}`, "error");
      return;
    }
    setAccepted(true);
  }

  if (accepted) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">Request sent.</p>
        <p className="text-xs text-muted">
          The coach will review and approve your access. You&apos;ll see the playbook once they do.
        </p>
        <Button variant="secondary" onClick={() => router.push("/home")} className="w-full">
          Go to home
        </Button>
      </div>
    );
  }

  return (
    <Button variant="primary" loading={pending} onClick={accept} className="w-full">
      Accept invite
    </Button>
  );
}
