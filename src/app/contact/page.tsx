import type { Metadata } from "next";
import { ContactForm } from "./ui";

export const metadata: Metadata = {
  title: "Contact · XO Gridmaker",
  description: "Send feedback, bug reports, or feature requests.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Contact</h1>
      <p className="mt-3 text-base leading-relaxed text-muted">
        Found a bug? Have an idea? Want to say hi? Drop a note below and it
        comes straight to my inbox.
      </p>
      <div className="mt-8">
        <ContactForm />
      </div>
    </div>
  );
}
