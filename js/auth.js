import { fetchProfile, onAuthStateChange, signIn, signOut } from './db.js';

let currentProfile = null;

export function getProfile() {
  return currentProfile;
}

export function canEditEvents() {
  const role = currentProfile?.role;
  return role === 'admin' || role === 'editor';
}

export function canDeleteEvents() {
  return currentProfile?.role === 'admin';
}

export function canManageEventTypes() {
  return currentProfile?.role === 'admin';
}

export function canEditTeam() {
  const role = currentProfile?.role;
  return role === 'admin' || role === 'editor';
}

async function refreshProfile() {
  currentProfile = await fetchProfile();
  return currentProfile;
}

function showLogin() {
  document.getElementById('app-root').hidden = true;
  document.getElementById('login-modal').showModal();
}

function showApp() {
  document.getElementById('login-modal').close();
  document.getElementById('app-root').hidden = false;
  const emailEl = document.getElementById('user-email');
  if (emailEl && currentProfile) {
    emailEl.textContent = currentProfile.email || '';
  }
}

function setupLoginForm() {
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');

    try {
      await signIn(email, password);
    } catch (err) {
      errorEl.textContent = err.message || 'Sign in failed.';
      errorEl.hidden = false;
    }
  });
}

function setupLogout() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
      await signOut();
    } catch (err) {
      alert(err.message || 'Sign out failed.');
    }
  });
}

function showLoadError(err) {
  console.error(err);
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = err.message || 'Failed to load your profile.';
  errorEl.hidden = false;
  showLogin();
}

export function bootstrapAuth(onSessionReady) {
  setupLoginForm();
  setupLogout();

  onAuthStateChange((event, session) => {
    if (!session) {
      currentProfile = null;
      showLogin();
      return;
    }

    // Only load app data on first session restore or explicit sign-in.
    // TOKEN_REFRESHED also fires on page load and must not trigger another fetch.
    if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN') {
      return;
    }

    // Defer data fetching until after the auth callback completes so the
    // access token is attached to subsequent Supabase API requests.
    setTimeout(() => {
      refreshProfile()
        .then(() => {
          showApp();
          return onSessionReady(event);
        })
        .catch(showLoadError);
    }, 0);
  });
}
