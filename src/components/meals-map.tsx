"use client";

import dynamic from "next/dynamic";
import type { MapPoint } from "@/config/neighborhood-coordinates";

// Leaflet a besoin de window : chargement côté client uniquement.
const MealsMapInner = dynamic(() => import("./meals-map-inner"), {
  ssr: false,
  loading: () => <div className="h-[60vh] min-h-80 w-full animate-pulse rounded-xl bg-stone-200" />,
});

export function MealsMap({ points }: { points: MapPoint[] }) {
  return <MealsMapInner points={points} />;
}
