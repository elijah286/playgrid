"use client";

import { useState } from "react";
import { Button, Input, useToast } from "@/components/ui";

export function ContactForm() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      setSent(true);
      setName("");
      setEmail("");
      setMessage("");
      toast("Message sent. Thanks!", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to send", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-border bg-surface-raised p-6 text-sm text-foreground">
        Thanks — your message is on its way. I&apos;ll get back to you as soon as I can.
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={() => setSent(false)}>
            Send another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="contact-name">
          Name
        </label>
        <Input
          id="contact-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          required
          maxLength={120}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="contact-email">
          Email
        </label>
        <Input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          maxLength={200}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="contact-message">
          Message
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What's on your mind?"
          required
          maxLength={5000}
          rows={6}
          className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-foreground placeholder:text-muted-light transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
        Send message
      </Button>
    </form>
  );
}
