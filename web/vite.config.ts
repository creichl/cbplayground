import react from '@vitejs/plugin-react'
import { defineConfig, type Connect } from 'vite'

// Who may show the pages in a frame: the booking embed (/embed/*) any website, every other page only the platform itself.
// The production server has to send the same headers (see README, "Embedding").
const frameAncestors: Connect.NextHandleFunction = (req, res, next) => {
  res.setHeader('Content-Security-Policy', req.url?.startsWith('/embed/') ? 'frame-ancestors *' : "frame-ancestors 'self'")
  next()
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'frame-ancestors',
      configureServer: (server) => void server.middlewares.use(frameAncestors),
      configurePreviewServer: (server) => void server.middlewares.use(frameAncestors),
    },
  ],
  server: {
    // Forward API calls to the local .NET API (see api/Cbplayground.Api/Properties/launchSettings.json),
    // so the frontend only uses relative /api URLs and needs no CORS.
    proxy: {
      '/api': 'http://localhost:5025',
    },
  },
})
