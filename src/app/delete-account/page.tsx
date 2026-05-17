import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Delete your account · XO Gridmaker",
  description:
    "How to permanently delete your XO Gridmaker account, what data is removed, and what is retained.",
};

export default function DeleteAccountPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 text-foreground">
      <h1 className="text-3xl font-extrabold tracking-tight">
        Delete your XO Gridmaker account
      </h1>
      <p className="mt-2 text-sm text-muted">Last updated: May 14, 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted">
        <section>
          <p>
            XO Gridmaker is operated by <strong>Kerry Software LLC</strong>.
            You can permanently delete your account and all the content
            you&apos;ve created at any time. The steps below explain how to do
            it, what is removed immediately, and what we retain for legal or
            operational reasons.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">
            Step 1 — Cancel any paid subscription first
          </h2>
          <p className="mt-2">
            Deleting your account does <strong>not</strong> automatically
            cancel an active Stripe subscription. If you have one, open your{" "}
            <Link href="/account" className="text-primary hover:underline">
              account page
            </Link>{" "}
            and use the &ldquo;Manage subscription&rdquo; link to cancel
            through the Stripe customer portal first. Otherwise you may
            continue to be billed after your account is gone.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">
            Step 2 — Delete from the app
          </h2>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            <li>
              Sign in at{" "}
              <a
                href="https://www.xogridmaker.com"
                className="text-primary hover:underline"
              >
                xogridmaker.com
              </a>{" "}
              on the web, or open the XO Gridmaker mobile app and sign in.
            </li>
            <li>
              Open the{" "}
              <Link href="/account" className="text-primary hover:underline">
                Account
              </Link>{" "}
              page (header menu &rarr; your name &rarr; Account).
            </li>
            <li>Scroll to the &ldquo;Delete account&rdquo; section.</li>
            <li>
              Type <code>delete</code> in the confirmation field to enable the
              button.
            </li>
            <li>Tap &ldquo;Permanently delete.&rdquo;</li>
          </ol>
          <p className="mt-3">
            Deletion is immediate. You will be signed out, your authentication
            record is removed, and the database cascade-deletes everything you
            owned before the page reloads.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">
            If you can&apos;t sign in
          </h2>
          <p className="mt-2">
            If you&apos;ve lost access to your account and can&apos;t reset your
            password, email us at{" "}
            <a
              href="mailto:admin@xogridmaker.com"
              className="text-primary hover:underline"
            >
              admin@xogridmaker.com
            </a>{" "}
            from the email address on the account, or use the{" "}
            <Link href="/contact" className="text-primary hover:underline">
              contact page
            </Link>
            . We&apos;ll verify ownership (typically a quick question about a
            playbook or team you created) and delete the account manually
            within 5 business days.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">
            What is deleted immediately
          </h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              Your authentication record — email, display name, password hash,
              avatar.
            </li>
            <li>
              All playbooks, plays, formations, notes, and edit history you
              own.
            </li>
            <li>
              Your team memberships — you&apos;re removed from any team you
              were a member of.
            </li>
            <li>
              Coach AI chat history and, if you opted in, your Coach AI
              feedback log.
            </li>
            <li>Per-account preferences, settings, and saved game results.</li>
            <li>
              Account-tied page-view, attribution, and usage records (the
              first-party product analytics described in our Privacy Policy).
            </li>
            <li>
              In-database subscription metadata. Note: this does not cancel
              your Stripe subscription — see Step 1 above.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">
            What is retained (and for how long)
          </h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              <strong>Operational backups.</strong> Encrypted database backups
              that contain your data at the moment of deletion age off
              automatically within 30 days. We cannot restore an individual
              account from a backup after deletion.
            </li>
            <li>
              <strong>Stripe billing records.</strong> If you ever paid for a
              subscription, Stripe retains the customer record, invoices, and
              payment history under their own retention policy (typically 7+
              years for tax and regulatory reasons). XO Gridmaker no longer
              has API access to your customer record once your account is
              deleted. To request deletion directly from Stripe, contact{" "}
              <a
                href="https://support.stripe.com/"
                className="text-primary hover:underline"
              >
                Stripe support
              </a>
              .
            </li>
            <li>
              <strong>Error reports (Sentry, web only).</strong> Browser
              errors sent to Sentry before deletion are retained under
              Sentry&apos;s default 90-day window and then purged
              automatically. These events do not contain playbook content.
            </li>
            <li>
              <strong>Team chat messages you posted.</strong> Messages in a
              team chat remain visible to that team so the conversation
              chronology stays intact. Each retained message is re-attributed
              to &ldquo;Deleted user&rdquo; rather than your name. If you want
              specific messages gone before deletion, delete them from within
              the chat first.
            </li>
            <li>
              <strong>Copies others made of your content.</strong> If another
              coach copied one of your public-example playbooks into their own
              team, that copy is now theirs and is not deleted with your
              account. The link between your account and the copy is removed.
            </li>
            <li>
              <strong>Aggregate, de-identified statistics.</strong> Counts
              that were derived from your activity before deletion (e.g.
              monthly active users, total signups) remain in our internal
              reporting but cannot be linked back to you.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">
            Questions
          </h2>
          <p className="mt-2">
            For anything else, reach us through the{" "}
            <Link href="/contact" className="text-primary hover:underline">
              contact page
            </Link>{" "}
            or email{" "}
            <a
              href="mailto:admin@xogridmaker.com"
              className="text-primary hover:underline"
            >
              admin@xogridmaker.com
            </a>
            . Our full data-handling practices are documented in the{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
