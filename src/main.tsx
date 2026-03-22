import { StrictMode, Component } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyBrand, loadBrand } from './lib/BrandingService'

// Boot: apply persisted brand before first render (prevents flash of default colors)
applyBrand(loadBrand());

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e }; }
  render() {
    if (this.state.error) {
      const e = this.state.error as Error;
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', background: '#0a0a0a', color: '#ef4444', minHeight: '100vh' }}>
          <h2 style={{ color: '#f87171', marginBottom: 16 }}>App Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#fca5a5' }}>{e.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#6b7280', marginTop: 12 }}>{e.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
