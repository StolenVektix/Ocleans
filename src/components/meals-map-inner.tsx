"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { BORDEAUX_CENTER, type MapPoint } from "@/config/neighborhood-coordinates";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export default function MealsMapInner({ points }: { points: MapPoint[] }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, { scrollWheelZoom: false }).setView([BORDEAUX_CENTER.lat, BORDEAUX_CENTER.lng], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>',
    }).addTo(map);
    for (const p of points) {
      // Cercle sur le centre du quartier : aucune adresse n'est révélée (règle 7).
      const marker = L.circleMarker([p.lat, p.lng], { radius: 10 + Math.min(p.meals.length, 5) * 2, color: "#c2410c", fillColor: "#ea580c", fillOpacity: 0.7 });
      const items = p.meals
        .map((m) => `<li><a href="/repas/${encodeURIComponent(m.id)}">${escapeHtml(m.title)}</a> — ${escapeHtml(m.when)}${m.seatsLeft === 0 ? " (complet)" : ""}</li>`)
        .join("");
      marker.bindPopup(`<strong>${escapeHtml(p.neighborhood)}</strong><ul style="margin:4px 0 0;padding-left:16px">${items}</ul>`);
      marker.bindTooltip(`${p.neighborhood} · ${p.meals.length} repas`);
      marker.addTo(map);
    }
    return () => {
      map.remove();
    };
  }, [points]);

  return <div ref={container} className="h-[60vh] min-h-80 w-full rounded-xl border border-stone-200" role="region" aria-label="Carte des repas à Bordeaux" />;
}
