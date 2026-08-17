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
