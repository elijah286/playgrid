import { OfflineLibraryClient } from "./OfflineLibraryClient";

export const dynamic = "force-static";

export const metadata = {
  title: "Offline playbooks",
};

/**
 * Native-app entry point for downloaded playbooks. Rendered as a static
 * shell so it's available without network — `OfflineLibraryClient` reads
 * from IndexedDB on mount.
 */
export default function OfflineLibraryPage() {
  return <OfflineLibraryClient />;
}
