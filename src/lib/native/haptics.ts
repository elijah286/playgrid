/**
 * Thin wrappers around `@capacitor/haptics` that no-op silently on the web
 * and on platforms where the plugin isn't available. Call sites can use
 * these without checking `isNativeApp()` first.
 */
import { isNativeApp } from "./isNativeApp";

type Impact = "light" | "medium" | "heavy";

export async function hapticImpact(style: Impact = "light"): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
    await Haptics.impact({ style: map[style] });
  } catch {
    /* plugin missing — ignore */
  }
}

export async function hapticSuccess(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* ignore */
  }
}

export async function hapticWarning(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Warning });
  } catch {
    /* ignore */
  }
}

export async function hapticSelection(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Haptics } = await import("@capacitor/haptics");
    await Haptics.selectionStart();
    await Haptics.selectionEnd();
  } catch {
    /* ignore */
  }
}
