import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyBrand, loadBrand } from './lib/BrandingService'

// Boot: apply persisted brand before first render (prevents flash of default colors)
applyBrand(loadBrand());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
