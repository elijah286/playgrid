"use client";

import { useState } from "react";
import { Button, Modal, Select, useToast } from "@/components/ui";
import { reportContentAction } from "@/app/actions/content-reports";
import {
  REPORT_REASONS,
  type ReportContentType,
} from "@/lib/moderation/report-types";

/**
 * Shared report dialog (App Store Guideline 1.2). Surfaces (chat messages, Cal
 * responses, shared plays, profiles) own the open/close state and render this
 * with the right `contentType` + reference. Writes via reportContentAction →
 * file_content_report RPC. Works for authenticated and anonymous (public share)
 * reporters alike.
 */
export function ReportDialog({
  open,
  onClose,
  contentType,
  contentRef = null,
  playbookId = null,
  reportedText = null,
  label = "Report content",
}: {
  open: boolean;
  onClose: () => void;
  contentType: ReportContentType;
  contentRef?: string | null;
  playbookId?: string | null;
  reportedText?: string | null;
  label?: string;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!reason) {
      toast("Choose a reason.", "error");
      return;
    }
    setSubmitting(true);
    const res = await reportContentAction({
      contentType,
      contentRef,
      playbookId,
      reason,
      details: details.trim() || null,
      reportedText,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast(res.error, "error");
      return;
    }
    toast("Thanks — we'll review this.", "success");
    setReason("");
    setDetails("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={label}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-xs font-medium text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <Button variant="danger" onClick={submit} loading={submitting} disabled={!reason}>
            Submit report
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Reports are reviewed by our team. We act on violations — including
          removing content and suspending accounts — typically within 24 hours.
        </p>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-foreground">Reason</span>
          <Select
            value={reason}
            onChange={setReason}
            options={REPORT_REASONS.map((r) => ({ value: r.value, label: r.label }))}
            placeholder="Choose a reason"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-foreground">
            Details <span className="font-normal text-muted">(optional)</span>
          </span>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Anything else we should know?"
            className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </label>
      </div>
    </Modal>
  );
}
