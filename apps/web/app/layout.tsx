import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Invoice Generaliser",
  description:
    "Extract any invoice to one canonical shape, then run deterministic funding controls over it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>
        <header className="masthead">
          <h1>Invoice Generaliser</h1>
          <span className="sub">Extraction &middot; Deterministic controls &middot; Funding decision</span>
        </header>
        {children}
      </body>
    </html>
  );
}
