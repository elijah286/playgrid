import * as Sentry from "@sentry/nextjs";
import { isNativeApp } from "@/lib/native/isNativeApp";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Skip Sentry inside the Capacitor native shell — App Store reviewers flag
// undisclosed third-party SDKs, and we'd rather not have to enumerate Sentry
// in the iOS privacy nutrition labels.
if (dsn && !isNativeApp()) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  });
}
