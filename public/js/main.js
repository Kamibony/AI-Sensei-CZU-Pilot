import { startAuthFlow } from './auth.js';

// This is the main entry point for the application's UI logic.
// It is called by `firebase-init.js` only after Firebase has been fully initialized.
export function initializeAppUI(auth, db, storage, functions) {
    
    // The entire application flow is now handled by the auth module.
    // It listens for auth state changes and renders the appropriate view (login or dashboard).
    startAuthFlow();
    
}