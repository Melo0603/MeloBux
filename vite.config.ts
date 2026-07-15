import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@firebase/auth")) return "firebase-auth";
          if (id.includes("node_modules/@firebase/firestore")) return "firebase-firestore";
          if (id.includes("node_modules/@firebase/storage")) return "firebase-storage";
          if (id.includes("node_modules/@firebase/functions")) return "firebase-functions";
          if (id.includes("node_modules/@firebase/messaging")) return "firebase-messaging";
          if (id.includes("node_modules/@firebase/app-check")) return "firebase-app-check";
          if (id.includes("node_modules/@firebase/analytics")) return "firebase-analytics";
          if (id.includes("node_modules/@firebase")) return "firebase-core";
          if (id.includes("node_modules/firebase")) return "firebase";
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (id.includes("node_modules/react")) return "react";
          return undefined;
        }
      }
    }
  }
});
