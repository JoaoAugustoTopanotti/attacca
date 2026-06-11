import path from "node:path";
import { fileURLToPath } from "node:url";
import { AlphaTabWebPackPlugin } from "@coderline/alphatab-webpack";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * alphaTab needs Web Workers + Audio Worklets and ships static assets
 * (Bravura font, SONiVOX soundfont). The official webpack plugin wires the
 * workers/worklets and copies the assets. We point `assetOutputDir` at
 * `public/` so Next serves them at `/font/` and `/soundfont/`.
 *
 * Because this is a webpack plugin, dev/build run with `--webpack`
 * (see package.json scripts) instead of the Next 16 default Turbopack.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // On the server we use alphaTab as a plain Node module (import .gp/MusicXML and
  // export canonical alphaTex). Keep it external so Next doesn't bundle its
  // worker/worklet code into the server build — it's required natively at runtime.
  serverExternalPackages: ["@coderline/alphatab"],
  webpack(config, { isServer }) {
    // Workers/worklets/assets are browser-only — apply on the client build.
    if (!isServer) {
      config.plugins.push(
        new AlphaTabWebPackPlugin({
          assetOutputDir: path.resolve(__dirname, "public"),
        }),
      );
    }
    return config;
  },
};

export default nextConfig;
