import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="en" className="dark">
      <body className="min-h-screen bg-black text-white antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
