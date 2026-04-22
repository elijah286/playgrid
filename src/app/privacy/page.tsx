import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · xogridmaker",
  description: "How xogridmaker handles your data.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 text-foreground">
      <h1 className="text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated: April 20, 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted">
        <section>
          <p>
            xogridmaker LLC (&quot;xogridmaker,&quot; &quot;we,&quot; &quot;us&quot;) cares about your privacy. This
            policy explains what we collect, why, and how it&apos;s protected.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">What we collect</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5">
            <li>
              <strong>Account info:</strong> email address and (optionally) a
              display name, used to sign you in and identify your playbooks.
            </li>
            <li>
              <strong>Content you create:</strong> formations, plays,
              playbooks, and related metadata.
            </li>
            <li>
              <strong>Technical data:</strong> standard server logs (IP, user
              agent, timestamps) generated when you use the Service.
            </li>
            <li>
              <strong>Contact form:</strong> messages you send us through the
              contact form, which are delivered to our inbox via an email
              provider (Resend).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">What we don&apos;t do</h2>
          <p className="mt-2">
            We don&apos;t run third-party analytics, advertising trackers, or
            behavioral profiling. We don&apos;t sell your data. We don&apos;t share your
            content with anyone except the people you explicitly share it with.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">How it&apos;s stored</h2>
          <p className="mt-2">
            Your data is stored in Supabase, which encrypts data at rest
            (AES-256) and in transit (TLS). Passwords are hashed — we never see
            or store them in plain text. Access is limited to what&apos;s required
            to operate the Service.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">Sub-processors</h2>
          <p className="mt-2">
            We rely on the following service providers to run the Service:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Supabase — database, authentication, and storage</li>
            <li>Vercel — application hosting</li>
            <li>Resend — transactional email (contact form)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">Your rights</h2>
          <p className="mt-2">
            You can access, export, or delete your account and content at any
            time. Email us through the{" "}
            <a href="/contact" className="text-primary hover:underline">
              contact page
            </a>{" "}
            and we&apos;ll handle it promptly.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">Children&apos;s privacy</h2>
          <p className="mt-2">
            xogridmaker is intended for coaches and adults. We don&apos;t knowingly
            collect personal information from children under 13. Players
            viewing shared playbooks don&apos;t need to create an account.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">Changes</h2>
          <p className="mt-2">
            If this policy changes materially, we&apos;ll announce it in-product or
            by email before the change takes effect.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">Contact</h2>
          <p className="mt-2">
            Questions? Use the{" "}
            <a href="/contact" className="text-primary hover:underline">
              contact page
            </a>
            .
          </p>
        </section>
      </div>
    </article>
  );
}
