import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            if (['ECONNREFUSED', 'ECONNRESET', 'EPIPE'].includes(err.code) || err.name === 'AggregateError') {
              if (res && !res.headersSent && typeof res.writeHead === 'function') {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Backend server starting up or temporarily unavailable' }));
              }
              return;
            }
            console.warn(`[vite proxy /api error] ${req.url}:`, err.message);
          });
        }
      },
      '/uploads': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req) => {
            // Video / audio range scrubbing and client disconnects trigger ECONNRESET / EPIPE normally
            if (['ECONNRESET', 'EPIPE', 'ECONNREFUSED'].includes(err.code) || err.name === 'AggregateError') {
              return;
            }
            console.warn(`[vite proxy /uploads error] ${req.url}:`, err.message);
          });
        }
      }
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
