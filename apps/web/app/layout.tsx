import type { Metadata } from "next";
import { Archivo, Instrument_Serif } from "next/font/google";
import "./globals.css";

// Two faces. Monospace is gone entirely: tabular-nums keeps figures aligned
// without it, and a fixed pitch was hurting readability at small sizes.
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


export const metadata: Metadata = {
  title: "Invoice Generaliser",
  description:
    "Extract any invoice to one canonical shape, then run deterministic funding controls over it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable}`}>
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
