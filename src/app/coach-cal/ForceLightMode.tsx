"use client";

import { useEffect } from "react";
import {
  applyColorSchemeToDocument,
  readStoredColorScheme,
} from "@/components/theme/colorModeStorage";

export function ForceLightMode() {
  useEffect(() => {
    const root = document.documentElement;
    const strip = () => {
      if (root.classList.contains("dark")) root.classList.remove("dark");
    };
    strip();
    const obs = new MutationObserver(strip);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => {
      obs.disconnect();
      applyColorSchemeToDocument(readStoredColorScheme());
    };
  }, []);
  return null;
}
