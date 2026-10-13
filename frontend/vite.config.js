import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:5000', changeOrigin: true }
    }
  },
  build: {
    // Disable production source maps completely
    sourcemap: false,
    minify: 'esbuild',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-framework': ['react', 'react-dom', 'react-router-dom'],
          'vendor-katex': ['katex', 'rehype-katex', 'remark-math'],
          'vendor-markdown': ['react-markdown', 'remark-gfm'],
          'vendor-utils': ['axios', 'react-hot-toast']
        }
      }
    }
  }
})
