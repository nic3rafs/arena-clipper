import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
    plugins: [
        webExtension({
            manifest: process.env.BROWSER === "firefox"
                ? "manifest.firefox.json"
                : "manifest.json",
            browser: process.env.BROWSER ?? "chrome"   // `BROWSER=firefox pnpm dev`
        })
    ],
    // Explicitly watch the CSS file for changes
    server: {
        watch: {
            // Ensure src/style.css is NOT ignored by the watcher
            // This overrides default ignores if necessary
            ignored: ['!**/src/style.css', '**/node_modules/**'] // Keep ignoring node_modules
        }
    },
    build: { target: "es2022", minify: "esbuild" }
});