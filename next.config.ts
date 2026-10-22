import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rendu dynamique classique : presque toutes les pages dépendent de la session.
  cacheComponents: false,
  experimental: {
    // Photo de carte de 4 Mo maximum, avec la marge du multipart. Vercel plafonne le corps à 4,5 Mo.
    serverActions: { bodySizeLimit: "4.4mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
