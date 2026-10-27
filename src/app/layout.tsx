import type { Metadata, Viewport } from "next";
import { DemoBanner } from "@/components/demo-banner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isDemoMode } from "@/lib/demo";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ocleans — Repas partagés entre habitants et étudiants",
  description: "Partagez un repas avec un étudiant à Bordeaux.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">
        {isDemoMode() && <DemoBanner />}
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
