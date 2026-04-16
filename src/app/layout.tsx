import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ConfigBanner } from "@/components/layout/ConfigBanner";
import { ToastProvider } from "@/components/ui/Toast";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "PlayGrid",
  description: "Football play designer for coaches and athletes — design, print, and carry your playbook.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable}`}>
      <body className="min-h-full bg-surface text-foreground font-sans">
        <ToastProvider>
          <ConfigBanner />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
