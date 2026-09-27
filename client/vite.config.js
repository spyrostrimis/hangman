import { defineConfig, transformWithOxc } from "vite";
import react from "@vitejs/plugin-react";

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
  plugins: [jsxInJs, react()],
  optimizeDeps: {
    rolldownOptions: {
      moduleTypes: { ".js": "jsx" },
    },
  },
});
