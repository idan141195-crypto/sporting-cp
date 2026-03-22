import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import OnboardingPage from './pages/OnboardingPage';
import { getUserConfig, clearUserConfig } from './lib/userConfig';
import './index.css';

function App() {
  const [view, setView] = useState<'onboarding' | 'dashboard'>(() => {
    // Force onboarding via hash (useful for re-running it intentionally)
    if (window.location.hash === '#onboarding') return 'onboarding';
    // Already completed onboarding
    if (getUserConfig().completed) return 'dashboard';
    // New client → show onboarding
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

  return <Dashboard onLogout={() => { clearUserConfig(); setView('onboarding'); }} />;
}

export default App;
