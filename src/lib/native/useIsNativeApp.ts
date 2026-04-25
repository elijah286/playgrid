"use client";

import { useEffect, useState } from "react";
import { isNativeApp, nativePlatform } from "./isNativeApp";

/**
 * Returns true after mount if running inside the Capacitor native shell.
 * SSR returns false to avoid hydration mismatches; the value flips on the
 * first client effect.
 */
export function useIsNativeApp(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(isNativeApp());
  }, []);
  return native;
}

export function useNativePlatform(): "ios" | "android" | "web" {
  const [platform, setPlatform] = useState<"ios" | "android" | "web">("web");
  useEffect(() => {
    setPlatform(nativePlatform());
  }, []);
  return platform;
}
