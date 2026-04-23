import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ConfigBanner } from "@/components/layout/ConfigBanner";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { FieldBackdrop } from "@/components/layout/FieldBackdrop";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import PageViewTracker from "@/components/PageViewTracker";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.xogridmaker.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "xogridmaker — Football play designer & playbook builder",
    template: "%s · xogridmaker",
  },
  description:
    "xogridmaker is a football play designer for coaches. Draw plays on a real grid, organize them into playbooks, preview wristbands, and carry your playbook to the field. Built for flag football, 7v7, and tackle.",
  applicationName: "xogridmaker",
  authors: [{ name: "xogridmaker" }],
  creator: "xogridmaker",
  publisher: "xogridmaker",
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
    siteName: "xogridmaker",
    title: "xogridmaker — Football play designer & playbook builder",
    description:
      "Draw football plays on a real grid, organize them into playbooks, preview wristbands, and carry your playbook to the field. Flag, 7v7, and tackle.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "xogridmaker — Football play designer & playbook builder",
    description:
      "Draw football plays on a real grid, organize them into playbooks, preview wristbands, and carry your playbook to the field.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  category: "sports",
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "xogridmaker",
    legalName: "xogridmaker",
    url: SITE_URL,
    description:
      "xogridmaker is a football play designer for coaches and athletes — build plays, organize playbooks, and preview wristbands.",
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "xogridmaker",
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "xogridmaker",
    applicationCategory: "SportsApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    description:
      "Design football plays, organize them into playbooks, preview wristbands, and carry your playbook to the field.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
  },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply color scheme before hydration to avoid flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='playgrid-color-scheme';var v=localStorage.getItem(k);if(v!=='light'&&v!=='dark'&&v!=='system')v='system';var d=v==='dark'||(v==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="flex min-h-[100dvh] flex-col bg-surface text-foreground font-sans">
        <ThemeProvider>
          <FieldBackdrop />
          <ToastProvider>
            <ConfigBanner />
            <SiteHeader />
            <div className="flex flex-1 flex-col">{children}</div>
            <SiteFooter />
            <PageViewTracker />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
