import { OfflinePlaybookClient } from "./OfflinePlaybookClient";

export const dynamic = "force-static";
export const dynamicParams = true;

/**
 * Catch-all offline playbook viewer. Renders a static shell so the route
 * is reachable without network; the client component reads the cached
 * data out of IndexedDB on mount.
 *
 * `dynamicParams=true` lets the route resolve for any playbook id without
 * pre-generating params at build time. With `force-static` + no data
 * fetching here the response is fully cacheable by the native shell.
 */
export default async function OfflinePlaybookPage({
  params,
}: {
  params: Promise<{ playbookId: string }>;
}) {
  const { playbookId } = await params;
  return <OfflinePlaybookClient playbookId={playbookId} />;
}
