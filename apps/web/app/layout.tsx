import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

// One face. Hierarchy comes from size, weight and colour rather than from
// switching typeface, so headings carry 600 while body stays at 400.
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
    <html lang="en" className={text.variable}>
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
