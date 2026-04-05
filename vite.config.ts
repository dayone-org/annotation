import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import oxlintPlugin from "vite-plugin-oxlint";

type PackageJson = {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"),
) as PackageJson;

const externalPackages = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
  "react/jsx-runtime",
]);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), oxlintPlugin()],
  build: {
    lib: {
      entry: {
        index: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
        styles: fileURLToPath(new URL("./src/styles.ts", import.meta.url)),
      },
      formats: ["es", "cjs"],
      fileName: (format, entryName) => {
        const extension = format === "es" ? "js" : "cjs";
        return `${entryName}.${extension}`;
      },
      cssFileName: "styles",
    },
    rollupOptions: {
      external: (id) => {
        for (const pkg of externalPackages) {
          if (id === pkg || id.startsWith(`${pkg}/`)) {
            return true;
          }
        }

        return false;
      },
      output: {
        banner: '"use client";',
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
