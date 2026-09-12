import React from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import OptionsApp from './OptionsApp';
import '../styles/global.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary title="设置页出错了">
      <OptionsApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
