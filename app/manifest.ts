import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RU ParkSmart",
    short_name: "ParkSmart",
    description: "Permit-aware parking and park-or-ride help for Rutgers commuters.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#cc0033",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
