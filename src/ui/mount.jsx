import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { setAudio } from './store.js';

export function mountUI(el, shell) {
  setAudio(shell.audioCtx);
  createRoot(el).render(<App shell={shell} />);
}
