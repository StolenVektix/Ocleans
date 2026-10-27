import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rendu dynamique classique : presque toutes les pages dépendent de la session.
  cacheComponents: false,
  experimental: {
    // Photo de carte de 4 Mio maximum, plus la marge du multipart : 4,2 Mio ≈ 4,4 Mo, sous les 4,5 Mo de Vercel.
    serverActions: { bodySizeLimit: "4.2mb" },
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
