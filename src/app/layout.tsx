import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ocleans — Repas partagés entre habitants et étudiants",
  description: "Partagez un repas avec un étudiant à Bordeaux.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
