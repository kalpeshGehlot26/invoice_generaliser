import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// One face. Poppins is the geometric sans IFG's own site sets its headings in,
// so the POC reads as part of their estate rather than as a separate tool.
// Hierarchy comes from size, weight and colour rather than from switching
// typeface, so headings carry 600 while body stays at 400.
const text = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-text",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Invoice Generaliser — IFG",
  description:
    "Extract any invoice to one canonical shape, then run deterministic funding controls over it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={text.variable}>
      <body>
        <header className="masthead">
          {/* The official mark, taken from interfacefinancial.com. Plain <img>
              rather than next/image: it is a static SVG of known size, so the
              optimiser has nothing to add and this keeps the header free of a
              client component. */}
          <img
            className="brandmark"
            src="/ifg-logo.svg"
            width={113}
            height={81}
            alt="The Interface Financial Group"
          />
          <h1>Invoice Generaliser</h1>
        </header>
        {children}
      </body>
    </html>
  );
}
