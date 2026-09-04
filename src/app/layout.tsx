import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
