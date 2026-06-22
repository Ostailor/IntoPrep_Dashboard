import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const sans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
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
  themeColor: "#082934",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${sans.variable} ${mono.variable} antialiased`}>
        <PwaRegister />
        <div className="portal-background" />
        <div className="portal-noise" />
        {children}
      </body>
    </html>
  );
}
