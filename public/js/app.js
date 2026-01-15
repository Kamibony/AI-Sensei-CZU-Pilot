import { initializeFirebase, auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { initProfessorApp } from './professor.js';
import { initStudentApp } from './student.js';
import './views/login-view.js'; // Import component definition
import { showToast, showGlobalSpinner, hideGlobalSpinner } from './utils/utils.js';
import { translationService } from './utils/translation-service.js';
import { DemoService } from './services/demo-service.js';
import { TourGuide } from './utils/tour-guide.js';

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

            if (user.isAnonymous) {
                userRole = sessionStorage.getItem('demoRole');
                if (!userRole) {
                    console.warn("Anonymous user but no demoRole found. Defaulting to student.");
                    userRole = 'student';
                }
            } else {
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
            }

            // Skryjeme spinner
            hideGlobalSpinner();

            // Teraz skontrolujeme rolu
            if (userRole === 'professor') {
                sessionStorage.setItem('userRole', userRole);
                renderMainLayout();
                await initProfessorApp(user);
                if (user.isAnonymous) startProfessorTour();
            } else if (userRole === 'student') {
                sessionStorage.setItem('userRole', userRole);
                renderMainLayout();
                initStudentApp(user);
                if (user.isAnonymous) startStudentTour();
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

async function startDemoMode(role) {
    showGlobalSpinner('Připravuji demo prostředí...');
    try {
        sessionStorage.setItem('demoRole', role);
        const { user } = await signInAnonymously(auth);

        // Initialize Demo Data
        const demoService = new DemoService();
        if (role === 'professor') {
            await demoService.initProfessorDemo();
        } else {
            await demoService.initStudentDemo();
        }

        // The onAuthStateChanged will handle the rest

    } catch (error) {
        console.error("Demo start failed:", error);
        hideGlobalSpinner();
        showToast("Nepodařilo se spustit demo režim.", "error");
    }
}

function startProfessorTour() {
    setTimeout(() => {
        const tour = new TourGuide();
        tour.start([
            {
                selector: 'professor-navigation',
                title: 'Vítejte v AI Sensei!',
                content: 'Toto je váš hlavní navigační panel. Zde najdete všechny nástroje pro správu výuky.',
                position: 'right'
            },
            {
                selector: 'professor-dashboard-view',
                title: 'Přehled',
                content: 'Zde vidíte přehled vašich tříd a nedávné aktivity.',
                position: 'bottom'
            },
             {
                selector: 'guide-bot',
                title: 'AI Asistent',
                content: 'Váš osobní AI asistent je připraven pomoci s čímkoliv. Stačí se zeptat!',
                position: 'left'
            }
        ]);
    }, 1500);
}

function startStudentTour() {
    setTimeout(() => {
        const tour = new TourGuide();
        tour.start([
             {
                selector: 'nav',
                title: 'Studijní portál',
                content: 'Vítejte ve svém portálu. Zde uvidíte své úkoly a materiály.',
                position: 'right'
            },
             {
                selector: 'guide-bot',
                title: 'Studijní Průvodce',
                content: 'Potřebujete vysvětlit látku? Váš AI průvodce je tu pro vás 24/7.',
                position: 'left'
            }
        ]);
    }, 1500);
}

document.addEventListener('demo-start', (e) => startDemoMode(e.detail.role));

main();
