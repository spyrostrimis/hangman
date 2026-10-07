import { defineConfig, transformWithOxc } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Publishes the repo's docs/presentations folder at /docs/presentations on the
// site. The source files stay in docs/; the build copies them into the output
// and writes an index page that links each file.
const presentationsSrc = fileURLToPath(new URL("../docs/presentations", import.meta.url));

let outDir = "dist";

const publishPresentations = {
  name: "publish-presentations",
  apply: "build",
  configResolved(config) {
    outDir = path.resolve(config.root, config.build.outDir);
  },
  closeBundle() {
    if (!existsSync(presentationsSrc)) {
      return;
    }
    const dest = path.join(outDir, "docs", "presentations");
    cpSync(presentationsSrc, dest, { recursive: true });
    const files = readdirSync(presentationsSrc)
      .filter((name) => !name.startsWith(".") && statSync(path.join(presentationsSrc, name)).isFile())
      .sort();
    const rows = files
      .map((name) => {
        const kb = Math.round(statSync(path.join(presentationsSrc, name)).size / 1024);
        return `<li><a href="./${encodeURIComponent(name)}">${name}</a> <span>${kb.toLocaleString("en")} KB</span></li>`;
      })
      .join("\n");
    writeFileSync(
      path.join(dest, "index.html"),
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>Hangman: Rescue Mission presentations</title>` +
        `<style>body{font:16px/1.6 system-ui,sans-serif;max-width:40rem;margin:0 auto;padding:2rem 1rem}span{color:#666;font-size:.9em}li{margin:.3rem 0}</style>` +
        `</head><body><h1>Presentations</h1><ul>\n${rows}\n</ul><p><a href="/">Back to the game</a></p></body></html>\n`,
    );
  },
};

const jsxInJs = {
  name: "jsx-in-js",
  enforce: "pre",
  transform(code, id) {
    if (!/\/src\/.*\.js$/.test(id)) {
      return null;
    }

    return transformWithOxc(code, id, {
      lang: "jsx",
      jsx: { runtime: "automatic" },
    });
  },
};

export default defineConfig({
  server: { port: 5173, strictPort: true, proxy: { '/user': 'http://localhost:8787' } },
  plugins: [jsxInJs, react(), publishPresentations],
  optimizeDeps: {
    rolldownOptions: {
      moduleTypes: { ".js": "jsx" },
    },
  },
});
