import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { LanguageProvider } from "@/components/providers/language-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { MqttProvider } from "@/components/providers/mqtt-provider";
import { CompatibilityBanner } from "@/components/compatibility-banner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PLTS Monitor — 48V LiFePO4 Solar Monitoring",
  description:
    "Progressive Web App for monitoring a 48V LiFePO4 PLTS (solar) system — INA219 battery current, ESP32 ADC voltage, ACS712 AC current, SHT31 ambient T/H. Monitoring-only: no relays, no actuators.",
  keywords: [
    "PLTS",
    "48V",
    "LiFePO4",
    "Solar",
    "Battery Monitor",
    "ESP32",
    "INA219",
    "ACS712",
    "SHT31",
    "PWA",
    "IoT",
  ],
  authors: [{ name: "PLTS Monitor" }],
  manifest: "/manifest.webmanifest",
  applicationName: "PLTS Monitor",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "PLTS Monitor",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "PLTS Monitor — 48V LiFePO4 Solar Monitoring",
    description: "PWA for monitoring a 48V LiFePO4 PLTS system (monitoring-only)",
    type: "website",
  },
};

// CRITICAL FIX (vs reference): userScalable: true (WCAG 1.4.4 — allow zoom).
// Reference had userScalable: false which violates accessibility.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0F1A" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          <LanguageProvider>
            <QueryProvider>
              <MqttProvider>
                <AuthProvider>
                  <CompatibilityBanner />
                  {children}
                  <Toaster />
                  <SonnerToaster position="top-right" richColors closeButton />
                </AuthProvider>
              </MqttProvider>
            </QueryProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
