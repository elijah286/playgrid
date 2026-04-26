"use client";

import { useState, useTransition } from "react";
import { Megaphone } from "lucide-react";
import { Button, Modal, useToast } from "@/components/ui";
import { notifyTeamAboutPlayAction } from "@/app/actions/play-notify";

const MAX_COMMENT_LEN = 2000;

export function NotifyTeamButton({
  playId,
  className,
  hideMobileLabel = false,
}: {
  playId: string;
  className?: string;
  hideMobileLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function send() {
    startTransition(async () => {
      const res = await notifyTeamAboutPlayAction({
        playId,
        comment: comment.trim() || null,
      });
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      toast(
        res.coalesced
          ? "Updated your team note (within 30 min — no extra email sent)."
          : "Team notified.",
        "success",
      );
      setOpen(false);
      setComment("");
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        leftIcon={Megaphone}
        onClick={() => setOpen(true)}
        className={className}
        title="Notify team about updates to this play"
      >
        <span className={hideMobileLabel ? "hidden sm:inline" : undefined}>
          Notify team
        </span>
      </Button>
      <Modal
        open={open}
        onClose={() => (pending ? null : setOpen(false))}
        title="Notify team about updates"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={send}
              disabled={pending}
            >
              {pending ? "Sending…" : "Send"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Sends an email to every active member of this playbook (except you)
          and adds an entry to their Activity feed. Repeated clicks within 30
          minutes update the same note instead of resending.
        </p>
        <label
          htmlFor="notify-team-comment"
          className="mt-3 block text-xs font-semibold text-foreground"
        >
          Comment for the team (optional)
        </label>
        <textarea
          id="notify-team-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={MAX_COMMENT_LEN}
          placeholder="What changed? Why does it matter?"
          className="mt-1 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <p className="mt-1 text-right text-[10px] text-muted">
          {comment.length}/{MAX_COMMENT_LEN}
        </p>
      </Modal>
    </>
  );
}
