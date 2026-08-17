import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Next loads `.env` relative to its own project directory, which in a monorepo
 * means `apps/web/.env` — not the repo root where a single shared secrets file
 * naturally lives. Load the root file here so `OPENROUTER_API_KEY` at the top
 * level works, which is what the README and the UI's error message promise.
 *
 * Real environment variables always win: this only fills gaps.
 */
function loadRootEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const rootEnv = join(here, "..", "..", ".env");
  if (!existsSync(rootEnv)) return;

  for (const line of readFileSync(rootEnv, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue; // skips blanks and # comments
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  }
}

loadRootEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-to-img pulls in @napi-rs/canvas, which ships prebuilt native binaries.
  // It must stay external to the bundler and run only on the server.
  serverExternalPackages: ["pdf-to-img", "@napi-rs/canvas"],
  transpilePackages: ["@invoice/extract", "@ifg/control-engine"],
  webpack: (config) => {
    // The workspace packages are ESM TypeScript source using explicit `.js`
    // specifiers. Teach webpack to resolve those to the `.ts` files.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
