import { defineConfig } from "vite";
import { resolve } from "path";
import cesium from "vite-plugin-cesium";

/**
 * Multi-page Vite config: builder (index) + viewer.
 * Cesium assets (Workers / Assets / Widgets) are copied by vite-plugin-cesium.
 */
export default defineConfig({
  base: "./",
  plugins: [cesium()],
  server: {
    port: 5173,
    proxy: {
      "/proxy": {
        target: "http://localhost:8091",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        viewer: resolve(__dirname, "viewer.html"),
      },
    },
  },
});
