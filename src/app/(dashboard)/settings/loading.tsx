import {
  AdminBodySkeleton,
  AdminHeader,
  AdminRouteProgress,
} from "./_components/AdminSkeleton";

/**
 * Route-level loading UI for the Site admin page (`/settings`).
 *
 * Next.js prefetches this and shows it instantly as a Suspense fallback
 * the moment the admin taps "Site Admin" — replacing the old behaviour
 * where the previous page sat frozen while ~40 server actions resolved.
 * The page itself fetches no data before it can render, so a full-page
 * skeleton is the right fallback (per the Next.js streaming guide).
 *
 * Admin-only route — never shown to regular users.
 */
export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <AdminRouteProgress />
      <AdminHeader />
      <AdminBodySkeleton />
    </div>
  );
}
