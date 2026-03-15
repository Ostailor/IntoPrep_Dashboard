import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const sans = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const display = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IntoPrep Admin Portal",
  description:
    "Internal operating dashboard for IntoPrep enrollment, academics, attendance, and finance workflows.",
  manifest: "/manifest.webmanifest",
  applicationName: "IntoPrep Admin Portal",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "IntoPrep",
  },
};

export const viewport: Viewport = {
  themeColor: "#17384b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${sans.variable} ${display.variable} ${mono.variable} antialiased`}>
        <PwaRegister />
        <div className="portal-background" />
        <div className="portal-noise" />
        {children}
      </body>
    </html>
  );
}
