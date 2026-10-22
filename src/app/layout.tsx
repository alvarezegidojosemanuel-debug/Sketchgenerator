import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PUÑETOS Pocket",
  description: "Convierte una idea cómica en un sketch editable y reproducible de PUÑETOS.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b2a6b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@600;800;900&display=swap" rel="stylesheet" />
        <link rel="icon" href="/assets/punetos/props/logo_punetos.webp" />
      </head>
      <body>{children}</body>
    </html>
  );
}
