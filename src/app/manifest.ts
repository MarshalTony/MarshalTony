import type { MetadataRoute } from "next";
import { getSchool } from "@/server/school";
import { brandScale } from "@/lib/theme";

// Read on request: the school's name, crest and theme colour can change in Settings.
export const dynamic = "force-dynamic";

/** "Add to home screen" / install: opens full screen with the school crest as the icon. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = "Bishop Ogez High School", color: string | null = null;
  try { const s = await getSchool(); name = s.name; color = s.themeColor; } catch { /* database unreachable: defaults */ }
  const short = name.split(/\s+/).slice(0, 2).join(" ");
  return {
    name: `${name} SMIS`,
    short_name: short.length <= 12 ? short : "School SMIS",
    description: `${name} — School Management Information System`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: brandScale(color)[900],
    icons: [
      { src: "/api/icon?size=192&solid=1", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/icon?size=512&solid=1", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/api/icon?size=512&solid=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
