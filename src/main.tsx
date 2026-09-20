import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing');

// Every indexable route is prerendered into static HTML at build time. By the
// time this module executes the real styles and scripts are already loaded,
// so adopt the container and replace the static markup with the live app.
if (container.firstChild) container.replaceChildren();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support: cache the app shell so Presentation Buddy opens anywhere.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {
        /* offline support is a bonus, never a blocker */
      });
  });
}
