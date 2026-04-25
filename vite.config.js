import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: ".",
  base: "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    // Emit static build into the worker public directory so Wrangler can deploy it
    outDir: path.resolve(__dirname, "worker", "public"),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
      },
    },
  },
});
