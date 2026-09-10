import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project site: set VITE_BASE=/REPO_NAME/ when deploying
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
})
