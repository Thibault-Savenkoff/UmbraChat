import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Makes the worker exist and able to receive push events - actually
// subscribing (Notification permission + pushManager.subscribe) is a
// separate, explicit opt-in from Settings, not done here.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
