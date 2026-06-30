import { bootstrapAuth } from './auth.js';
import { initApp, refreshApp } from './app.js';

let appStarted = false;

bootstrapAuth(async (event) => {
  if (!appStarted) {
    appStarted = true;
    await initApp();
    return;
  }

  if (event === 'SIGNED_IN') {
    await refreshApp();
  }
});
