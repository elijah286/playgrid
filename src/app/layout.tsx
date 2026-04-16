import type { Metadata } from "next";
import "./globals.css";
import { ConfigBanner } from "@/components/layout/ConfigBanner";

export const metadata: Metadata = {
  title: "PlayGrid",
  description: "Youth football play designer — offense, print, and field viewing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">
        <ConfigBanner />
        {children}
      </body>
    </html>
  );
}
