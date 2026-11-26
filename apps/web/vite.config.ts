import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Loopback explícito: en Node 26 `localhost` resuelve a ::1 y 127.0.0.1 no respondía.
    host: '127.0.0.1',
    // En desarrollo la web y la API comparten origen gracias al proxy, igual que
    // detrás de Caddy en producción; así el código del navegador usa rutas relativas.
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  test: {
    environment: 'jsdom',
    // Sin globales: cada prueba importa lo que usa.
    globals: false,
  },
});
