import { describe, it, expect } from "vitest";
import { COACH_CAL_IMAGE_UPLOADS_ENABLED } from "./image-upload";

describe("Coach Cal image uploads", () => {
  it("stay disabled — the attach UI and the server vision path are both off", () => {
    // Pulled 2026-06-11: unreliable hand-drawn vision pipeline + expensive
    // per-image vision calls. Both the client gate (CoachAiChat.tsx) and the
    // server guard (api/coach-ai/stream/route.ts) read this one flag, so this
    // is a tripwire: if a refactor flips the feature back on, this fails and
    // forces an intentional decision to re-enable both ends.
    expect(COACH_CAL_IMAGE_UPLOADS_ENABLED).toBe(false);
  });
});
