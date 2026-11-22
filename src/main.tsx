import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import './index.css';

// Ignore benign Chromium ResizeObserver loop notifications (e.g. during rapid flex-pane
// resizing or multi-node canvas mount) without affecting real runtime errors.
window.addEventListener(
  'error',
  (event) => {
    if (
      event.message === 'ResizeObserver loop completed with undelivered notifications.' ||
      event.message === 'ResizeObserver loop limit exceeded'
    ) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  },
  true
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
