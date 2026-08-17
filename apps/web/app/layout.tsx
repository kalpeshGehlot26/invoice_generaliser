import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

// Three faces, each with one job. Mono was doing all three before, which is
// why prose was hard to read at small sizes on a dark ground.
const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const text = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-text",
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
    <html lang="en" className={`${display.variable} ${text.variable} ${mono.variable}`}>
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
