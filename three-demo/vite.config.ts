import {defineConfig} from 'vite';

// Отдельный конфиг: корень vite.config.ts занят редактором Motion Canvas.
export default defineConfig({
  root: __dirname,
  server: {port: 5180, strictPort: true},
});
