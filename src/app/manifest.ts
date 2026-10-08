import type { MetadataRoute } from "next";

/** Web App Manifest (served at /manifest.webmanifest). Makes the app
 * installable; additive only — no effect on data or future phases. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shared Meter Tracker",
    short_name: "Shared Meter",
    description: "Track shared prepaid electricity balances in kWh",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#16a34a",
    icons: [
      { src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
