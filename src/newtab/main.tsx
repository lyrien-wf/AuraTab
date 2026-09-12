import React from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import App from './App';
import '../styles/global.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary title="新标签页出错了">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
