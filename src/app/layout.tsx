import type { Metadata } from "next";
import { Bebas_Neue, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { ConfigBanner } from "@/components/layout/ConfigBanner";
import { ColorModeScript } from "@/components/theme/ColorModeScript";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

const display = Bebas_Neue({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const sans = Source_Sans_3({ subsets: ["latin"] });

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
    <html lang="en" className={`h-full antialiased ${display.variable}`} suppressHydrationWarning>
      <body className={`min-h-full bg-pg-mist text-pg-ink ${sans.className}`}>
        <ColorModeScript />
        <ThemeProvider>
          <ConfigBanner />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
