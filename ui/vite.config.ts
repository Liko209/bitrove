import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Read version from the root package.json so it stays in sync with what
// the release script bumps. Injected as a compile-time global; see the
// declaration in ui/src/global.d.ts.
const rootPkg = JSON.parse(
  readFileSync(resolve(__dirname, "..", "package.json"), "utf8"),
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: {
      "/api": "http://127.0.0.1:8770",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
