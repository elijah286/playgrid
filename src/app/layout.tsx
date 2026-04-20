import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ConfigBanner } from "@/components/layout/ConfigBanner";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://playgrid.us";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PlayGrid — Football play designer for coaches",
    template: "%s · PlayGrid",
  },
  description:
    "PlayGrid is a football play designer for coaches and athletes. Design plays, organize them into playbooks, preview wristbands, and carry your playbook to the field.",
  applicationName: "PlayGrid",
  authors: [{ name: "PlayGrid LLC" }],
  creator: "PlayGrid LLC",
  publisher: "PlayGrid LLC",
  keywords: [
    "football playbook",
    "play designer",
    "football plays",
    "flag football",
    "7v7",
    "youth football",
    "wristband",
    "coach tools",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "PlayGrid",
    title: "PlayGrid — Football play designer for coaches",
    description:
      "Design plays, organize them into playbooks, preview wristbands, and carry your playbook to the field.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "PlayGrid — Football play designer for coaches",
    description:
      "Design plays, organize them into playbooks, and carry your playbook to the field.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  category: "sports",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable}`}>
      <head>
        {/* Apply color scheme before hydration to avoid flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='playgrid-color-scheme';var v=localStorage.getItem(k);if(v!=='light'&&v!=='dark'&&v!=='system')v='system';var d=v==='dark'||(v==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="flex min-h-[100dvh] flex-col bg-surface text-foreground font-sans">
        <ThemeProvider>
          <ToastProvider>
            <ConfigBanner />
            <div className="flex flex-1 flex-col">{children}</div>
            <SiteFooter />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
