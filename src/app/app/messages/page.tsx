import { MessageCircle } from "lucide-react";
import { MessagesList } from "./MessagesList";

/**
 * Messages hub — the "did anyone message any of my teams?" view the production
 * lobby is missing. The list itself is the shared MessagesList (also used as
 * the persistent left column in the desktop master-detail thread view).
 */
export default function AppMessagesPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-extrabold tracking-tight text-foreground">Messages</h1>

      <MessagesList />

      <p className="flex items-center gap-1.5 px-1 text-xs text-muted">
        <MessageCircle className="size-3.5" aria-hidden />
        Each team has one group channel — coaches, players &amp; parents.
      </p>
    </div>
  );
}
