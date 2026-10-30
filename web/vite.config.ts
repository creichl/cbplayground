import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls to the local .NET API (see api/Cbplayground.Api/Properties/launchSettings.json),
    // so the frontend only uses relative /api URLs and needs no CORS.
    proxy: {
      '/api': 'http://localhost:5025',
    },
  },
})
