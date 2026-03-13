import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      include: /\.[jt]sx?$/
    })
  ],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.[jt]sx?$/,
    exclude: []
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx'
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 3000
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 3000
  }
});
