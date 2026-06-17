import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · XO Gridmaker",
  description: "How XO Gridmaker handles your data.",
};

export default function PrivacyPage() {
  // iOS in-app purchases are permanently enabled, so the Apple App Store is
  // always an active payment sub-processor — disclose it unconditionally.
  // (Was gated on the old IAP kill-switch, now removed.)
  const iapEnabled = true;
  return (
    <article className="mx-auto max-w-2xl px-6 py-16 text-foreground">
      <h1 className="text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated: June 17, 2026</p>

      {/* The "Your rights" section below already covers deletion — keep that
          and the new dedicated section consistent if either is edited. */}

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted">
        <section>
          <p>
            Kerry Software, LLC (&quot;XO Gridmaker,&quot; &quot;we,&quot; &quot;us&quot;) cares about your privacy. This
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
              {iapEnabled ? (
                <>
                  {" "}If you subscribe inside the iOS app, Apple processes the
                  payment and shares your subscription status with us (again, we
                  never see your card number).
                </>
              ) : null}
            </li>
            <li>
              <strong>Contact form:</strong> messages you send us through the
              contact form, which are delivered to our inbox via an email
              provider (Resend).
            </li>
            <li>
              <strong>Tutorial progress:</strong> if you start a guided tour
              in the Learning Center, we save which tutorial you&apos;re on,
              the current step, the sport variant active when you started,
              and whether you completed or dismissed it. This is so the
              tour can resume where you left off and never auto-prompt you
              twice. It&apos;s stored only on our own servers, scoped to
              your account.
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
              <strong>Coach AI chat history:</strong> when you chat with
              Coach Cal we store your messages and Cal&apos;s replies on
              our servers, organized per playbook. This is what lets Cal
              keep working on a long answer if you close the chat window
              and pick up the result when you return, and it lets the
              same conversation appear when you sign in on another
              device. Only you (and our database administrators acting
              for support / debugging) can read your conversation. You
              can wipe the history for a given playbook at any time
              with the trash icon at the top of the chat panel — that
              deletes the rows on our servers, not just on your device.
            </li>
            <li>
              <strong>Coach AI image attachments:</strong> Coach Cal accepts
              photo attachments (e.g. a snapshot of a play sheet,
              wristcoach, or whiteboard) so Cal can read what&apos;s drawn
              and help you import plays. Images you attach are sent
              in-flight to Anthropic (see the sub-processors list below)
              to interpret their content and are <em>not</em> stored on
              our servers. Cal sees each image only on the turn it was
              attached; we don&apos;t retain a copy afterward. The chat
              history row keeps your typed text plus a
              &ldquo;[image attached]&rdquo; placeholder but no image
              bytes. Image uploads are capped at 10 per coach per
              calendar month.
            </li>
            <li>
              <strong>Cancellation feedback (optional):</strong> when a paid
              subscriber clicks &ldquo;Manage billing&rdquo;, we show an
              optional text box where they can tell us why they&rsquo;re
              leaving (or what isn&rsquo;t working). Anything typed there is
              stored on our servers and read by the site admin so we can
              improve the product. Skipping it stores nothing. We also
              record whatever cancellation reason Stripe&rsquo;s billing
              portal captures (a category and any comment you choose to
              leave there) so we have one place to read both.
            </li>
            <li>
              <strong>Coach AI feedback (opt-in):</strong> if you accept the
              one-time prompt the first time you use Coach AI, we log the
              <em> topic</em> of any question Coach AI had to answer from
              general football knowledge instead of our seeded playbook
              (e.g. &ldquo;Tampa 2 defense&rdquo;), along with your question
              text and the playbook context (sport variant, sanctioning body,
              age division). We use this to decide which topics to add to the
              knowledge base next. You can opt out at any time by asking
              Coach AI to update your preference.
            </li>
            <li>
              <strong>Team chat:</strong> if your playbook has team
              messaging turned on, every message you post (text, sender,
              and timestamp) is stored so other members can read it. The
              owner of a playbook can disable messaging or clear all
              history at any time. While you&apos;re typing, a brief
              &ldquo;is typing&hellip;&rdquo; signal is broadcast to other
              members in the same chat — that signal is not stored. You
              can edit or delete your own message within 15 minutes of
              posting; after that, only the playbook&apos;s coaches can
              remove it. Deleted messages leave a tombstone (&ldquo;this
              message has been deleted&rdquo;) so the chronology stays
              intact.
            </li>
          </ul>
          <p className="mt-3">
            <strong>Inside the iOS / Android app:</strong> detailed in-app
            product-usage event tracking and error reporting are turned off, and
            the advertising-conversion pixels (Reddit, Meta) do not load — so the
            app does not track you and shows no cookie-consent prompt. The
            native app collects the account info, content, and standard server
            logs above, plus: a per-install identifier together with your device
            platform, app version, and the dates the app was installed and last
            opened — linked to your account — so we can measure how many people
            install and actively use the apps; and, if you allow notifications, a
            per-device push token used only to deliver the notifications
            you&apos;d expect (practice and game reminders, play updates, and team
            messages). You can turn notifications off at any time in your device
            settings, and the token is removed when you sign out.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-foreground">What we don&apos;t do</h2>
          <p className="mt-2">
            We don&apos;t sell your data, and we don&apos;t share your content
            with anyone except the people you explicitly share it with. When we
            run ads on Reddit or Meta, their conversion pixels count ad-driven
            page visits and signups so we can tell which ads work (see
            Sub-processors) — they&apos;re consent-gated for EU/UK visitors and
            we don&apos;t use them to build cross-site behavioral profiles or to
            upload personally identifying information.
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
            <li>
              Google Cloud Platform — application hosting (our Next.js
              server runs on Cloud Run in the us-central1 region, where
              all user requests are processed)
            </li>
            <li>
              Resend — transactional email (contact form, team
              notifications, daily digest of playbook activity)
            </li>
            <li>Stripe — payment processing for paid plans{iapEnabled ? " (web)" : ""}</li>
            {iapEnabled ? (
              <>
                <li>
                  Apple App Store — processes in-app subscription purchases made
                  on iPhone/iPad. When you subscribe inside the iOS app, Apple
                  handles the payment and shares your purchase and renewal status
                  with us; we never see your card details.
                </li>
              </>
            ) : null}
            <li>
              Firebase Cloud Messaging (Google) — delivers push
              notifications to the Android app. We send Google a
              per-device messaging token and the notification text; Google
              does not retain the message beyond delivering it
            </li>
            <li>
              Apple Push Notification service (APNs) — delivers push
              notifications to the iOS app. We send Apple a per-device
              token and the notification text; Apple does not retain the
              message beyond delivering it
            </li>
            <li>Sentry — browser and server error reporting (web only)</li>
            <li>
              Reddit — when we run ads on Reddit, the Reddit Ads pixel
              loads on our site to count page visits and signups from
              ad clicks. This lets us see which ads work without
              uploading any personally identifying information. The
              pixel is suppressed for EU/UK visitors who have not
              accepted tracking, and it does not load inside the iOS /
              Android app.
            </li>
            <li>
              Meta (Facebook/Instagram) — when we run ads on Meta, the
              Meta Ads pixel loads on our site to count page visits and
              signups from ad clicks, so we can measure which ads work and
              reach similar coaches. It reports a page-view and a
              signup-completion event; we don&apos;t upload personally
              identifying information through it. The pixel is suppressed
              for EU/UK visitors who have not accepted tracking, and it
              does not load inside the iOS / Android app.
            </li>
            <li>
              Apple — if you choose &ldquo;Sign in with Apple,&rdquo; Apple
              authenticates you and shares your email and name with us
            </li>
            <li>
              Google — if you choose &ldquo;Sign in with Google,&rdquo; Google
              authenticates you and shares your email, name, and profile
              photo with us
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
              which case your Coach AI chat messages (and any images you
              attach) are sent to Anthropic to generate responses. Images
              are processed in-flight and not retained by us; Anthropic&apos;s
              retention is governed by their API terms.
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
            XO Gridmaker is offered to coaches in the United States. If you visit
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
            XO Gridmaker is intended for coaches and adults. We don&apos;t knowingly
            collect personal information from children under 13. Players
            invited to a playbook sign in with their email to view it; only
            individual play links (e.g. a single play shared by URL) can be
            viewed without an account.
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
