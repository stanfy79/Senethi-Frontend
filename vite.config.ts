import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  build: {
    rollupOptions: {
      external: [
        "@solana/kit",
        "@solana-program/system",
        "@solana-program/token",
      ],
    },
  },
});