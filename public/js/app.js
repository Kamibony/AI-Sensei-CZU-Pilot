import { initializeFirebase, auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { initProfessorApp } from './professor.js';
import { initStudentApp } from './student.js';
import './views/login-view.js'; // Import component definition
import { showToast, showGlobalSpinner, hideGlobalSpinner } from './utils/utils.js';
import { translationService } from './utils/translation-service.js';
// Pomocná funkcia na čakanie na rolu (Backoff strategy)
async function waitForUserRole(user, maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
        // Vynútime refresh tokenu zo servera
        const tokenResult = await user.getIdTokenResult(true);
        if (tokenResult.claims.role) {
            return tokenResult.claims.role;
        }
        console.log(`Čakanie na priradenie roly... pokus ${i + 1}/${maxAttempts}`);
        // Čakáme 2 sekundy pred ďalším pokusom
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    return null;
}

async function main() {
    try {
        await translationService.init();
        await initializeFirebase();
        console.log("Firebase fully initialized.");
    } catch (error) {
        console.error("Firebase init failed:", error);
        renderCriticalError(translationService.t('common.app_init_error'));
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Zobrazíme loading ihneď, lebo získavanie roly môže trvať
            showGlobalSpinner(translationService.t('common.app_setting_account'));

            let userRole;
            let tokenResult = await user.getIdTokenResult();
            userRole = tokenResult.claims.role;

            // Ak rola chýba, predpokladáme, že je to nová registrácia
            // a funkcia na serveri ešte len beží. Spustíme čakanie.
            if (!userRole) {
                console.warn("User role is missing, waiting for backend...");
                userRole = await waitForUserRole(user);
            }

            // Fallback for the original admin if role is still missing
            if (!userRole && user.email === 'profesor@profesor.cz') {
                userRole = 'professor';
                 console.log("Applying legacy admin fallback role.");
            }

            // Skryjeme spinner
            hideGlobalSpinner();

            // Teraz skontrolujeme rolu
            if (userRole === 'professor') {
                sessionStorage.setItem('userRole', userRole);
                renderMainLayout();
                await initProfessorApp(user);
            } else if (userRole === 'student') {
                sessionStorage.setItem('userRole', userRole);
                renderMainLayout();
                initStudentApp(user);
            } else {
                // Ak rola stále chýba, odhlásime ho s chybou
                console.error("Failed to get user role after multiple attempts. Logging out.");
                showToast(translationService.t('common.app_role_error'), true);
                signOut(auth);
            }

        } else {
            // Používateľ nie je prihlásený
            sessionStorage.removeItem('userRole');
            renderLoginState();
        }
    });
}

function renderLoginState() {
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        appContainer.innerHTML = '<login-view></login-view>';
    }
}

function renderLoadingState() {
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        appContainer.innerHTML = `<div class="flex items-center justify-center h-screen"><div class="text-xl text-slate-600 animate-pulse">${translationService.t('common.app_loading')}</div></div>`;
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
