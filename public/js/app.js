import { initializeFirebase, auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { initProfessorApp } from './professor.js';
import { initStudentApp, cleanupStudentDashboard } from './student.js';
import { initAuth } from './auth.js';
import { showToast, showGlobalSpinner, hideGlobalSpinner } from './utils.js';

async function main() {
    try {
        await initializeFirebase();
        console.log("Firebase fully initialized.");
    } catch (error) {
        console.error("Firebase init failed:", error);
        renderCriticalError("Nepodařilo se připojit k aplikaci.");
        return;
    }

    initAuth();

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            let tokenResult = await user.getIdTokenResult();
            let userRole = tokenResult.claims.role;

            // Ak rola chýba, predpokladáme, že je to nová registrácia
            // a funkcia na serveri ešte len beží.
            if (!userRole) {
                console.warn("User role is missing, attempting to refresh token...");

                // Zobrazíme nejaký globálny spinner/loading
                showGlobalSpinner("Nastavujem váš účet, prosím čakajte...");

                // Začneme "poll" (dopytovať sa) na nový token
                // Použijeme parameter 'true' na vynútenie obnovy

                // Skúsime to 3-krát, s 3-sekundovým oneskorením
                for (let i = 0; i < 3; i++) {
                    await new Promise(resolve => setTimeout(resolve, 3000)); // Počkáme 3 sekundy

                    tokenResult = await user.getIdTokenResult(true); // Vynútime refresh
                    userRole = tokenResult.claims.role;

                    if (userRole) break; // Ak rolu máme, končíme

                    console.log(`Token refresh attempt ${i + 1} failed to get role.`);
                }

                // Skryjeme spinner
                hideGlobalSpinner();
            }

            // Fallback for the original admin if role is still missing
            if (!userRole && user.email === 'profesor@profesor.cz') {
                userRole = 'professor';
                 console.log("Applying legacy admin fallback role.");
            }

            // Teraz (po prípadnom čakaní) skontrolujeme rolu znova
            if (userRole === 'professor') {
                sessionStorage.setItem('userRole', userRole);
                renderMainLayout();
                await initProfessorApp(user);
            } else if (userRole === 'student') {
                sessionStorage.setItem('userRole', userRole);
                if (typeof cleanupStudentDashboard === 'function') {
                    cleanupStudentDashboard();
                }
                renderMainLayout();
                initStudentApp();
            } else {
                // Ak rola stále chýba, odhlásime ho s chybou
                console.error("Failed to get user role after multiple attempts. Logging out.");
                showToast("Nepodarilo sa načítať rolu používateľa. Skúste sa prihlásiť znova.", true);
                signOut(auth);
            }

        } else {
            // Používateľ nie je prihlásený
            sessionStorage.removeItem('userRole');
            if (typeof cleanupStudentDashboard === 'function') {
                 cleanupStudentDashboard();
            }
            renderLoginState();
        }
    });
}

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

function renderMainLayout() {
    const appContainer = document.getElementById('app-container');
    const mainAppTemplate = document.getElementById('main-app-template');
    if (appContainer && mainAppTemplate) {
        appContainer.innerHTML = '';
        appContainer.appendChild(mainAppTemplate.content.cloneNode(true));
    }
}

function renderCriticalError(msg) {
     document.body.innerHTML = `<div class="flex items-center justify-center h-screen text-red-600 bg-red-50 p-8"><h1 class="text-2xl">${msg}</h1></div>`;
}

main();
