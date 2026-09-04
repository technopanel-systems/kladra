import type { MetadataRoute } from "next";

/**
 * What a phone needs to install Kladra (SPEC §3: "installable on a phone — PWA
 * manifest, icons, offline splash only, no offline data").
 *
 * A rep works standing in a lobby (S23). An icon on the home screen and a
 * window with no browser chrome is the difference between opening the app and
 * finding the tab it was in.
 *
 * The name is not translated. It is a mark, the sidebar spells it with a Latin
 * K in both locales, and a manifest carries one name for one installed app —
 * a second one in Arabic would mean two apps on one phone.
 *
 * `start_url` is "/" rather than "/en": the proxy sends it to whichever
 * language that person last used, so an installed icon follows the user menu's
 * choice instead of freezing whatever was current on the day they installed it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Stable for the life of the app: change this and a phone treats it as a
    // different app and installs a second icon beside the first.
    id: "/",
    name: "Kladra",
    short_name: "Kladra",
    description: "Technopanel CRM",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Dark is the default theme (D16), so this is the colour the splash and
    // the status bar wear before any CSS has loaded.
    background_color: "#0f0d0c",
    theme_color: "#0f0d0c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops these to the launcher's own shape; the mark sits inside
      // the middle 80% so nothing of it is cut off (scripts/icons.ts).
      {
        src: "/icons/maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
