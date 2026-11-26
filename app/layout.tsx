import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Nav } from "@/components/Nav";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

// Overpass descends from Highway Gothic, the lettering on US road signs.
const overpass = localFont({
  src: [
    { path: "./fonts/Overpass-Regular.ttf", weight: "400" },
    { path: "./fonts/Overpass-Medium.ttf", weight: "500" },
    { path: "./fonts/Overpass-SemiBold.ttf", weight: "600" },
    { path: "./fonts/Overpass-Bold.ttf", weight: "700" },
    { path: "./fonts/Overpass-ExtraBold.ttf", weight: "800" },
    { path: "./fonts/Overpass-Black.ttf", weight: "900" },
  ],
  variable: "--font-overpass",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RU ParkSmart",
  description: "Where your permit lets you park, whether the lot will be full, and when to take the bus instead.",
  applicationName: "RU ParkSmart",
  appleWebApp: { capable: true, title: "ParkSmart", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#2a2e33",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={overpass.variable}>
      {/* Browser extensions (e.g. Grammarly) add attributes to <body> before React loads. */}
      <body className="min-h-dvh antialiased" suppressHydrationWarning>
        <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
          <header className="flex items-center justify-between px-4 pt-5 pb-3">
            <a href="/" className="flex items-center gap-2.5 text-[17px] font-extrabold tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-[7px] bg-scarlet p-[2px]" aria-hidden>
                <span className="grid h-full w-full place-items-center rounded-[5px] border-[1.5px] border-white text-[15px] font-black text-white">
                  P
                </span>
              </span>
              RU ParkSmart
            </a>
            <span className="text-[13px] font-semibold text-muted">Pilot</span>
          </header>
          <main className="flex-1 px-4 pb-28">{children}</main>
          <Nav />
        </div>
        <ServiceWorker />
      </body>
    </html>
  );
}
