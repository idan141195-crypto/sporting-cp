import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import OnboardingPage from './pages/OnboardingPage';
import { getUserConfig } from './lib/userConfig';
import './index.css';

function App() {
  const [view, setView] = useState<'onboarding' | 'dashboard'>(() => {
    // Force onboarding via hash (useful for re-running it intentionally)
    if (window.location.hash === '#onboarding') return 'onboarding';
    // Already completed onboarding
    if (getUserConfig().completed) return 'dashboard';
    // Power-user / developer: Replicate token is already in .env.local → skip onboarding
    if (import.meta.env.VITE_REPLICATE_API_TOKEN) return 'dashboard';
    // New client with no API keys → show onboarding
    return 'onboarding';
  });

  if (view === 'onboarding') {
    return (
      <OnboardingPage
        onComplete={() => {
          window.location.hash = '';
          setView('dashboard');
        }}
      />
    );
  }

  return <Dashboard />;
}

export default App;
