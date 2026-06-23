import type { Metadata, Viewport } from "next";
import { BrowserRuntimeGuard } from "@/components/browser-runtime-guard";
import "./globals.css";

export const metadata: Metadata = {
  title: "IntoPrep Admin Portal",
  description:
    "Internal operating dashboard for IntoPrep enrollment, academics, attendance, and finance workflows.",
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
      <body className="antialiased">
        <BrowserRuntimeGuard />
        <div className="portal-background" />
        <div className="portal-noise" />
        {children}
      </body>
    </html>
  );
}
