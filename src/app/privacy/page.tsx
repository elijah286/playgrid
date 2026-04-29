import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · xogridmaker",
  description: "How xogridmaker handles your data.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 text-foreground">
      <h1 className="text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated: April 29, 2026</p>

      {/* The "Your rights" section below already covers deletion — keep that
          and the new dedicated section consistent if either is edited. */}

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
              <strong>Product usage (first-party):</strong> the pages you visit,
              your session ID, device class (mobile/tablet/desktop), referring
              URL, the landing page you arrived on, and the standard UTM
              parameters (source, medium, campaign, content, term) on first
              visit, plus aggregate time-on-site. We use this to understand
              which features get used, to size the product to actual usage,
              and to measure which marketing campaigns brought you here. It
              is collected by us, stored in our own database, and never shared
              with an analytics vendor.
            </li>
            <li>
              <strong>Ad-platform click IDs:</strong> if you arrive from an
              advertisement, the click identifier the platform attaches to the
              link (Meta&apos;s <code>fbclid</code>, Google&apos;s <code>gclid</code>,
              TikTok&apos;s <code>ttclid</code>, and the equivalents for Bing,
              LinkedIn, and X). We use these to attribute signups back to the
              specific ad and market that drove them.
            </li>
            <li>
              <strong>Approximate location:</strong> we look up your IP address
              against a local copy of the MaxMind GeoLite2 database to derive
              country, region (state/province), and city. The IP itself is not
              stored. We use approximate location to understand which markets
              respond to which campaigns.
            </li>
            <li>
              <strong>Error reports:</strong> when something goes wrong in your
              browser, we send the error stack and the page URL to Sentry to
              help us fix it. Errors include the same technical data above
              but no playbook content.
            </li>
            <li>
              <strong>Billing:</strong> if you subscribe to a paid plan, your
              payment details are collected by Stripe — we never see your card
              number. Stripe shares your customer ID, email, and subscription
              status with us so we can grant access to paid features.
            </li>
            <li>
              <strong>Contact form:</strong> messages you send us through the
              contact form, which are delivered to our inbox via an email
              provider (Resend).
            </li>
            <li>
              <strong>Edit history:</strong> when a play or playbook is edited,
              we save a snapshot along with the editor&apos;s name, the time of
              the edit, and (optionally) a note left by the editor. Team coaches
              can review this history and restore prior versions. Deleted plays
              are kept in a 30-day trash before being permanently removed.
            </li>
            <li>
              <strong>Referral records:</strong> when you send another coach
              a copy of your playbook and they claim it, we record the link
              between your account and theirs along with the date so we can
              credit your account if a referral reward is in effect. Each
              recipient can only generate one such record. We don&apos;t
              share the record with anyone outside our system, and you can
              ask us to delete it at any time.
            </li>
            <li>
              <strong>Coach AI feedback (opt-in):</strong> if you accept the
              one-time prompt the first time you use Coach AI, we log the
              <em> topic</em> of any question Coach AI had to answer from
              general football knowledge instead of our seeded playbook
              (e.g. &ldquo;Tampa 2 defense&rdquo;), along with your question
              text and the playbook context (sport variant, sanctioning body,
              age division). We use this to decide which topics to add to the
              knowledge base next. We don&apos;t log the rest of your chat. You
              can opt out at any time by asking Coach AI to update your
              preference.
            </li>
          </ul>
          <p className="mt-3">
            <strong>Inside the iOS / Android app:</strong> product-usage and
            error reporting are turned off entirely. The native app collects
            only the account info, content, and standard server logs above.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">What we don&apos;t do</h2>
          <p className="mt-2">
            We don&apos;t run advertising trackers or behavioral profiling. We
            don&apos;t sell your data. We don&apos;t share your content with anyone
            except the people you explicitly share it with.
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
            <li>
              Resend — transactional email (contact form, team
              notifications, daily digest of playbook activity)
            </li>
            <li>Stripe — payment processing for paid plans</li>
            <li>Sentry — browser and server error reporting (web only)</li>
            <li>
              Apple — if you choose &ldquo;Sign in with Apple,&rdquo; Apple
              authenticates you and shares your email and name with us
            </li>
            <li>
              Google Maps Platform — if your team uses the calendar venue
              autocomplete, the address text you type is sent to Google to
              return matching places
            </li>
            <li>
              OpenAI — only if you opt into the Coach AI tier, in which case
              the play descriptions you submit are sent to OpenAI to generate
              suggestions and to produce search embeddings for the Coach AI
              knowledge base
            </li>
            <li>
              Anthropic — only if you opt into the Coach AI tier and the
              site administrator has selected Claude as the active provider, in
              which case your Coach AI chat messages are sent to Anthropic to
              generate responses
            </li>
            <li>
              MaxMind — we download a copy of their free GeoLite2 IP-to-city
              database to our server and look up your IP locally. Your IP is
              never sent to MaxMind.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">EU/UK visitors</h2>
          <p className="mt-2">
            xogridmaker is offered to coaches in the United States. If you visit
            from the European Union, the European Economic Area, or the United
            Kingdom, we ask for your consent before collecting any of the
            campaign-attribution data above (UTM parameters, referrer, ad
            click IDs, region, city, and landing page). Until you choose
            &ldquo;Accept all,&rdquo; we record only what is strictly necessary
            to operate the Service: your session ID, the page path, device
            class, and country. Your choice is remembered for one year and
            can be changed by clearing your cookies for our domain.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">Your rights</h2>
          <p className="mt-2">
            You can access, export, or delete your account and content at any
            time. To delete your account, sign in and use the &ldquo;Delete
            account&rdquo; option on your{" "}
            <a href="/account" className="text-primary hover:underline">
              account page
            </a>{" "}
            — this immediately removes your auth record and cascades to your
            playbooks, plays, formations, and usage data. For anything else,
            reach us through the{" "}
            <a href="/contact" className="text-primary hover:underline">
              contact page
            </a>
            .
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
