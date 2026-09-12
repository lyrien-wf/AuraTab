import React from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import PopupApp from './PopupApp';
import '../styles/global.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary title="弹窗出错了">
      <PopupApp />
    </ErrorBoundary>
  </React.StrictMode>,
);
