import type { Metadata } from "next";
import { RemindersClient } from "@/features/reminders/RemindersClient";

export const metadata: Metadata = {
  title: "Reminders · XO Gridmaker",
};

export default function RemindersPage() {
  return (
    <div className="mx-auto max-w-md">
      <RemindersClient />
    </div>
  );
}
