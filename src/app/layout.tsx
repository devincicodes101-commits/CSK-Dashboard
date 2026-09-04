import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Archivo for everything that is read, JetBrains Mono for everything that is
 * scanned — labels, figures under figures, the corrections.
 *
 * The split is the point. Uppercase mono at 10px with wide tracking reads as
 * instrumentation rather than prose, which lets the figures themselves be the
 * only thing on the page that is large.
 */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-archivo",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CSK Weekly Metrics",
  description:
    "Weekly sales, revenue and cash figures for CSK Electric, from Jobber and QuickBooks.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${archivo.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
