import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import MentorView from './components/MentorView.tsx'

// Offline support (production build only — skipped in dev so you always see fresh code)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Public mentor review links (?share=TOKEN) render without login.
const shareToken = new URLSearchParams(window.location.search).get('share');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {shareToken ? <MentorView token={shareToken} /> : <App />}
  </StrictMode>,
)
