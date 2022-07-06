import { defineConfig } from "vite";

export default defineConfig({
  test: {
    environment: "happy-dom",
    silent: true,
    watch: false,
  },
});
