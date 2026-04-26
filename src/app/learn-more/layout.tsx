import type { ReactNode } from "react";
import { ForceLightMode } from "./ForceLightMode";

export default function LearnMoreLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.classList.remove('dark');`,
        }}
      />
      <ForceLightMode />
      {children}
    </>
  );
}
