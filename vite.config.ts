import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Pinned port: your saved data lives per-address, so the app must
  // always open on the SAME link (http://localhost:5173).
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 1000 },
})
