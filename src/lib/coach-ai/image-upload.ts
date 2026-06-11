// Coach Cal photo attachments — master on/off switch.
//
// DISABLED 2026-06-11. The hand-drawn play-sheet vision pipeline proved
// unreliable (small pencil arrows, rounded routes, and dashed motion were
// hit-or-miss) and the per-image vision calls were expensive, so the feature
// was pulled.
//
// This single flag gates BOTH ends of the feature so it cannot come back
// half-on:
//   - the client attach affordance + paste-to-attach path (CoachAiChat.tsx)
//   - the server's acceptance of an image payload (api/coach-ai/stream)
//
// The server guard is the real safety boundary: even a stale or crafted
// client that still sends `userImage` is rejected before the costly vision
// call runs. The `coach_ai_image_upload` beta flag is now inert while this is
// false — flip this to true (and re-confirm the vision pipeline) to re-enable.
export const COACH_CAL_IMAGE_UPLOADS_ENABLED = false;
