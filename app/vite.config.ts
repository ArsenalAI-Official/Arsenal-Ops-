import path from "path"
import react from "@vitejs/plugin-react"
import { inspectAttr } from 'kimi-plugin-inspect-react'
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: '/',
  plugins: [
    ...(command === 'serve' ? [inspectAttr()] : []),
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Bump the warning ceiling — we manually-chunk the big libs below so they
    // load on demand instead of joining the initial bundle.
    chunkSizeWarningLimit: 800,
    target: 'es2022',
    minify: 'terser',
    sourcemap: false,
    terserOptions: {
      compress: {
        passes: 2,
        drop_console: ['log', 'debug', 'info'],
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        // Only carve out the truly-heavy libraries. Everything else (incl. React,
        // radix, lucide) falls into vite's default chunking — avoids circular
        // chunk references which cause runtime errors.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          // Mermaid + its diagram engines are huge (~550 KB gzipped) and only
          // needed when an architecture diagram renders.
          if (id.includes('mermaid') || id.includes('cytoscape') || id.includes('katex')) return 'mermaid';
          // Recharts + d3 are heavy and only needed where charts render.
          if (id.includes('recharts') || /\/d3-[a-z]/.test(id)) return 'charts';
          return undefined;
        },
      },
    },
  },
}));
