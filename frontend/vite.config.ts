import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brandingDir = path.resolve(__dirname, "../branding");
const logoSource = path.join(brandingDir, "logo.png");
const faviconSource = path.join(brandingDir, "favicon.png");

function syncBrandingAssets() {
  if (fs.existsSync(logoSource)) {
    const publicLogo = path.resolve(__dirname, "public/logo.png");
    const backendLogo = path.resolve(__dirname, "../backend/assets/logo.png");

    fs.mkdirSync(path.dirname(publicLogo), { recursive: true });
    fs.mkdirSync(path.dirname(backendLogo), { recursive: true });
    fs.copyFileSync(logoSource, publicLogo);
    fs.copyFileSync(logoSource, backendLogo);
  }

  if (fs.existsSync(faviconSource)) {
    try {
      execSync("node scripts/generate-favicons.mjs", { cwd: __dirname, stdio: "pipe" });
    } catch (err) {
      console.warn("[favicons] Generation skipped — run npm run generate:favicons after npm install");
    }
  }
}

syncBrandingAssets();

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    {
      name: "sync-branding-assets",
      buildStart: syncBrandingAssets,
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@branding": brandingDir,
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
