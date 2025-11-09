import { initializeFirebase, auth } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
// Importy funkcií s názvami, ktoré sme zjednotili
import { initProfessorApp } from './professor.js';
import { initStudentApp, cleanupStudentDashboard } from './student.js';
import { initAuth } from './auth.js';

async function main() {
    try {
        await initializeFirebase();
        console.log("Firebase fully initialized.");
    } catch (error) {
        console.error("Firebase init failed:", error);
        renderCriticalError("Nepodařilo se připojit k aplikaci.");
        return;
    }

    // Aktivujeme prihlasovacie formuláre
    initAuth();

    // Sledujeme zmeny stavu prihlásenia
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // console.log("Logged in as:", user.email);
            renderLoadingState();

            // --- ROBUSTNÁ LOGIKA PODĽA EMAILU ---
            if (user.email === 'profesor@profesor.cz') {
                // Je to profesor
                await initProfessorApp(user);
            } else {
                // Všetci ostatní sú študenti
                // Najprv vyčistíme prípadné staré listenery
                if (typeof cleanupStudentDashboard === 'function') {
                    cleanupStudentDashboard();
                }
                // Spustíme študentskú aplikáciu
                initStudentApp();
            }
            // ------------------------------------

        } else {
            // Nikto nie je prihlásený, zobrazíme login
            renderLoginState();
        }
    });
}

// --- Pomocné funkcie pre vykresľovanie stavov ---

function renderLoginState() {
    const appContainer = document.getElementById('app-container');
    const loginTemplate = document.getElementById('login-template');
    if (appContainer && loginTemplate) {
        appContainer.innerHTML = '';
        appContainer.appendChild(loginTemplate.content.cloneNode(true));
    }
}

function renderLoadingState() {
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        appContainer.innerHTML = '<div class="flex items-center justify-center h-screen"><div class="text-xl text-slate-600 animate-pulse">Načítám aplikaci...</div></div>';
    }
}

function renderCriticalError(msg) {
     document.body.innerHTML = `<div class="flex items-center justify-center h-screen text-red-600 bg-red-50 p-8"><h1 class="text-2xl">${msg}</h1></div>`;
}

// Štart aplikácie
main();
