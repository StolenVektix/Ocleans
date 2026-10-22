import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rendu dynamique classique : presque toutes les pages dépendent de la session.
  cacheComponents: false,
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
