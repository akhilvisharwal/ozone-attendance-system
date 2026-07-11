/**
 * Generates favicon assets from branding/favicon.png into frontend/public/.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import toIco from "to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(frontendRoot, "..");
const sourceCandidates = [
  path.join(frontendRoot, "branding", "favicon.png"),
  path.join(repoRoot, "branding", "favicon.png"),
];
const source = sourceCandidates.find((p) => fs.existsSync(p));
const publicDir = path.join(frontendRoot, "public");

if (!source) {
  console.warn("[favicons] favicon.png not found — skipping favicon generation.");
  process.exit(0);
}

fs.mkdirSync(publicDir, { recursive: true });

const outputs = [
  { size: 16, name: "favicon-16x16.png" },
  { size: 32, name: "favicon-32x32.png" },
  { size: 48, name: "favicon-48x48.png" },
  { size: 180, name: "apple-touch-icon.png" },
  { size: 192, name: "android-chrome-192x192.png" },
  { size: 512, name: "android-chrome-512x512.png" },
];

export async function generateFavicons() {
  for (const { size, name } of outputs) {
    await sharp(source)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(publicDir, name));
  }

  const icoSizes = [16, 32, 48];
  const pngBuffers = await Promise.all(
    icoSizes.map((size) =>
      sharp(source)
        .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );
  fs.writeFileSync(path.join(publicDir, "favicon.ico"), await toIco(pngBuffers));

  const manifest = {
    name: "Ozone Aircon Attendance Management System",
    short_name: "Ozone Aircon",
    description: "Ozone Aircon HVAC Solutions — Attendance Management System",
    icons: [
      { src: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
    theme_color: "#2E7DFF",
    background_color: "#ffffff",
    display: "standalone",
    start_url: "/",
  };
  fs.writeFileSync(path.join(publicDir, "site.webmanifest"), `${JSON.stringify(manifest, null, 2)}\n`);
}

generateFavicons()
  .then(() => console.log("[favicons] Generated favicon assets in frontend/public/"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
