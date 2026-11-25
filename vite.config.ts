import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({ plugins: [react()], clearScreen: false, server: { port: 1430, strictPort: true, watch: { ignored: ['**/src-tauri/**', '**/out/**'] } }, build: { target: 'es2022', chunkSizeWarningLimit: 2000 }, optimizeDeps: { exclude: ['manifold-3d'] } });
