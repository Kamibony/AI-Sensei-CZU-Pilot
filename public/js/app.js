// public/js/app.js

import { initializeAuth, renderLogin, handleLogout } from './auth.js';
import { initializeProfessor, setupProfessorNav, initProfessorDashboard } from './professor.js';
import { initializeStudent, setupStudentNav, initStudentDashboard } from './student.js';

// --- App State ---
let auth, db, functions;
let currentUserRole = null;
const appContainer = () => document.getElementById('app-container');

// This is the main entry point for the application's UI
export function initializeAppUI(appAuth, appDb, appStorage, appFunctions) {
    auth = appAuth;
    db = appDb;
    functions = appFunctions;

    // Initialize all modules with the necessary Firebase services and helper functions
    initializeAuth(auth, db, showToast, login);
    initializeProfessor(db, functions, showToast);
    initializeStudent(db, auth, functions, showToast);

    // The initial call to renderLogin() is handled by the onAuthStateChanged listener in auth.js
}

// --- Core App Logic ---

function showToast(message, isError = false) {
    const toastContainer = document.getElementById('toast-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 5000);
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
    const style = document.createElement('style');
    style.textContent = `
        #toast-container { position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; }
        .toast { padding: 12px 20px; border-radius: 8px; font-size: 14px; color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1); opacity: 0; transform: translateX(100%); transition: all 0.3s ease; }
        .toast.show { opacity: 1; transform: translateX(0); }
        .toast-success { background-color: #28a745; }
        .toast-error { background-color: #dc3545; }
    `;
    document.head.appendChild(style);
    return container;
}

// The main login function, passed to auth.js, which directs the app based on role
async function login(role) {
    currentUserRole = role;
    if (!appContainer()) return;

    // Clear login form and render the main app structure
    appContainer().innerHTML = document.getElementById('main-app-template').innerHTML;

    const assistantBtn = document.getElementById('ai-assistant-btn');
    if (assistantBtn) assistantBtn.style.display = 'flex';

    // Setup navigation and dashboard based on the user's role
    if (role === 'professor') {
        setupProfessorNav();
        await initProfessorDashboard();
    } else {
        setupStudentNav();
        await initStudentDashboard();
    }

    // Attach common event listeners
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    // document.getElementById('ai-assistant-btn').addEventListener('click', showAiAssistant);
}

// Placeholder for the global AI assistant modal
function showAiAssistant() {
    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) return;
    modalContainer.innerHTML = `
        <div class="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg">
                 <header class="p-4 border-b flex justify-between items-center">
                     <h3 class="text-xl font-semibold">🤖 AI Asistent</h3>
                     <button id="close-modal-btn" class="p-2 rounded-full hover:bg-slate-100">✖</button>
                 </header>
                 <main class="p-6">
                     <p>AI Asistent se připravuje.</p>
                 </main>
            </div>
        </div>`;
    document.getElementById('close-modal-btn').addEventListener('click', () => modalContainer.innerHTML = '');
}