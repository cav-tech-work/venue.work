import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VenuePlatform — Immersive 3D Venue Intelligence",
  description:
    "High-fidelity 3D venue scanning, spatial intelligence, and real-time event planning at industrial scale.",
  keywords: ["venue", "3D scanning", "spatial intelligence", "event planning"],
  authors: [{ name: "VenuePlatform" }],
  robots: "index, follow",
  openGraph: {
    title: "VenuePlatform — Immersive 3D Venue Intelligence",
    description: "High-fidelity 3D venue scanning and spatial intelligence.",
    type: "website",
    locale: "en_US",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="bg-background text-text-primary antialiased min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
