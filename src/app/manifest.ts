import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IntoPrep Admin Portal",
    short_name: "IntoPrep",
    description:
      "Installable operations portal for IntoPrep enrollment, academics, attendance, billing, and integrations.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#efe7d7",
    theme_color: "#17384b",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/pwa-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/pwa-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
