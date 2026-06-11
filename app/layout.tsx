import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { PortalThemeProvider } from "@/components/theme/PortalThemeProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "裕日 AI 話術對練平台",
  description: "裕日汽車銷售訓練平台",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <Script id="portal-theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem("ynm-portal-theme");if(t==="default")document.documentElement.dataset.portalTheme="default";}catch(e){}})();`}
        </Script>
        <PortalThemeProvider>{children}</PortalThemeProvider>
      </body>
    </html>
  );
}
