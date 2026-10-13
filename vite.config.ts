import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 주소(https://zich-k.github.io/team-task/) 기준
export default defineConfig({
  base: '/team-task/',
  plugins: [react()],
  server: { port: 5180 },
});
