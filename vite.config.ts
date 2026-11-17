import { defineConfig } from 'vitest/config'

// Chemins relatifs : le site est servi sous /Correcteur-pro/ et l’APK
// doit aussi pouvoir ouvrir la copie embarquée hors connexion.
export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', port: 4179, strictPort: true },
  preview: { host: '0.0.0.0', port: 4179, strictPort: true },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@huggingface/transformers')) return 'transformers'
          if (id.includes('jspdf')) return 'pdf'
          if (id.includes('docx')) return 'docx'
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
