import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Bishop Ogez SMIS", template: "%s · Bishop Ogez SMIS" },
  description: "Bishop Ogez High School Management Information System",
  robots: { index: false, follow: false },
  // Browser-tab / home-screen icon = the school logo (Settings → School profile), served by /api/icon.
  icons: {
    icon: [{ url: "/api/icon?size=32", sizes: "32x32", type: "image/png" }, { url: "/api/icon?size=192", sizes: "192x192", type: "image/png" }],
    shortcut: "/api/icon?size=48",
    apple: [{ url: "/api/icon?size=180", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = { themeColor: "#1d4ed8", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-UG">
      <body>
        {children}
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
