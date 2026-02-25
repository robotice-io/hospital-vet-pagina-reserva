import "@/styles/globals.css";

import type { Metadata, Viewport } from "next";

import clsx from "clsx";

import { Providers } from "./providers";
import { fontSans } from "@/config/fonts";

export const metadata: Metadata = {
  title: "Agendar Cita - Hospital Veterinario Integral",
  description: "Agenda tu cita veterinaria en línea.",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning lang="es">
      <body
        className={clsx(
          "min-h-dvh bg-background font-sans antialiased",
          fontSans.variable,
        )}
      >
        <Providers themeProps={{ attribute: "class", defaultTheme: "light", forcedTheme: "light" }}>
          <main className="mx-auto flex h-dvh w-full max-w-lg flex-col overflow-hidden px-4 py-6 lg:max-w-3xl">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
