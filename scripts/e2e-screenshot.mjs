/**
 * End-to-end smoke: drive the real UI as a user would, then screenshot it.
 *
 * Curling /api/process proves the pipeline. It does not prove the results UI
 * renders that payload — which is a separate failure mode, and the one a client
 * actually sees. This uploads a file through the real file input, waits for the
 * verdict, and writes a screenshot.
 *
 *   node scripts/e2e-screenshot.mjs <invoice-path> [url] [out.png]
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(
  existsSync,
);

const [, , fileArg, urlArg, outArg] = process.argv;
const file = resolve(fileArg ?? "");
const url = urlArg ?? "http://localhost:4500";
const out = outArg ?? "e2e.png";

if (!CHROME) throw new Error("No Chrome/Chromium binary found.");
if (!existsSync(file)) throw new Error(`Invoice not found: ${file}`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
  defaultViewport: { width: 1600, height: 1000 },
});

try {
  const page = await browser.newPage();
  page.on("console", (m) => m.type() === "error" && console.error("  [console]", m.text()));

  await page.goto(url, { waitUntil: "networkidle2" });

  const input = await page.waitForSelector('input[type="file"]', { timeout: 15_000 });
  await input.uploadFile(file);
  console.log(`uploaded ${file}`);

  await page.waitForFunction(
    () => {
      const b = document.querySelector("button.go");
      return b && !b.disabled;
    },
    { timeout: 10_000 },
  );
  await page.click("button.go");
  console.log("processing…");

  // Extraction is a live model call: allow real time for it.
  await page.waitForSelector(".verdict, .error", { timeout: 180_000 });

  const failed = await page.$(".error");
  if (failed) {
    console.error("ERROR PANEL:", await page.$eval(".error", (e) => e.innerText.trim()));
  } else {
    const verdict = await page.$eval(".verdict", (e) => e.innerText.replace(/\s+/g, " ").trim());
    const findings = await page.$$eval(".finding .code", (els) => els.map((e) => e.textContent));
    console.log("verdict :", verdict);
    console.log("findings:", findings.join(", "));
  }

  await new Promise((r) => setTimeout(r, 600)); // let the reveal animation settle
  await page.screenshot({ path: out, fullPage: true });
  console.log(`screenshot -> ${out}`);
} finally {
  await browser.close();
}
