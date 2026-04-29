import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service · XO Gridmaker",
  description: "XO Gridmaker terms of service.",
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 text-foreground">
      <h1 className="text-3xl font-extrabold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted">Last updated: April 20, 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted">
        <section>
          <h2 className="text-base font-semibold text-foreground">1. Acceptance of terms</h2>
          <p className="mt-2">
            By creating an account or using XO Gridmaker (the &quot;Service&quot;), you agree to
            these Terms of Service. If you do not agree, do not use the Service.
            The Service is operated by XO Gridmaker LLC (&quot;XO Gridmaker,&quot; &quot;we,&quot; &quot;us&quot;),
            a Texas limited liability company.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">2. Your account</h2>
          <p className="mt-2">
            You are responsible for maintaining the confidentiality of your
            account credentials and for all activity that occurs under your
            account. You must provide accurate information and notify us
            promptly of any unauthorized use.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">3. Your content</h2>
          <p className="mt-2">
            Plays, formations, playbooks, and other content you create remain
            yours. You grant XO Gridmaker a limited license to store, process, and
            display that content solely as needed to operate the Service for you
            and any users you share with.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">4. Acceptable use</h2>
          <p className="mt-2">
            You agree not to use the Service to violate any law, infringe anyone&apos;s
            rights, upload malicious code, attempt to disrupt the Service, or
            access accounts or data that are not yours.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">5. Service availability</h2>
          <p className="mt-2">
            The Service is provided &quot;as is&quot; and &quot;as available.&quot; We do not
            guarantee uninterrupted operation, and we may change, suspend, or
            discontinue features at any time.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">6. Disclaimer and limitation of liability</h2>
          <p className="mt-2">
            To the maximum extent permitted by law, XO Gridmaker disclaims all
            warranties, express or implied. XO Gridmaker&apos;s total liability for any
            claim related to the Service will not exceed the amounts you paid
            us (if any) in the 12 months preceding the claim.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">7. Termination</h2>
          <p className="mt-2">
            You may stop using the Service at any time. We may suspend or
            terminate your access if you violate these Terms. On termination,
            your right to use the Service ends immediately.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">8. Governing law</h2>
          <p className="mt-2">
            These Terms are governed by the laws of the State of Texas, without
            regard to its conflict of law rules. Any dispute will be resolved
            in the state or federal courts located in Travis County, Texas.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">9. Changes</h2>
          <p className="mt-2">
            We may update these Terms from time to time. Material changes will
            be announced in-product or via email. Continued use after changes
            constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">10. Contact</h2>
          <p className="mt-2">
            Questions about these Terms? Reach out via the{" "}
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
