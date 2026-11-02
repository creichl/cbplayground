import './styles/app.css'
import './i18n/index.ts'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

if (import.meta.env.DEV) void import('./checkTailwind.ts').then(({ warnIfTailwindIsMissing }) => warnIfTailwindIsMissing())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
