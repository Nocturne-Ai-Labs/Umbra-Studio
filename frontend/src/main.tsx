import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { FirstRunGate } from '@/components/onboarding/FirstRunWizard';
import { I18nProvider } from '@/i18n';
import './app/globals.css';
import '@/styles/ultra-performance.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <FirstRunGate>
        <App />
      </FirstRunGate>
    </I18nProvider>
  </React.StrictMode>
);
