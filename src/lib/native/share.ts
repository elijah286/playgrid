/**
 * Native share sheet wrapper. On native, opens the OS share sheet
 * (iMessage/Slack/Mail/etc.). On the web, falls back to the Web Share API
 * if available, then to copying the URL to the clipboard.
 *
 * Returns `true` if the share/copy completed, `false` if the user
 * cancelled or no method worked.
 */
import { isNativeApp } from "./isNativeApp";

export type ShareInput = {
  title?: string;
  text?: string;
  url?: string;
  /** Label for the iOS/iPadOS share sheet. */
  dialogTitle?: string;
};

export async function nativeShare(input: ShareInput): Promise<"shared" | "copied" | "cancelled"> {
  if (isNativeApp()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({
        title: input.title,
        text: input.text,
        url: input.url,
        dialogTitle: input.dialogTitle ?? input.title,
      });
      return "shared";
    } catch {
      return "cancelled";
    }
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: input.title, text: input.text, url: input.url });
      return "shared";
    } catch {
      // fall through to clipboard
    }
  }

  const toCopy = input.url ?? input.text ?? "";
  if (toCopy && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(toCopy);
      return "copied";
    } catch {
      return "cancelled";
    }
  }
  return "cancelled";
}
