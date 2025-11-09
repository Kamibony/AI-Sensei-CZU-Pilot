import { initializeFirebase, auth, db } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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

    initAuth();

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            renderLoadingState();

            let role = sessionStorage.getItem('userRole');

            if (!role) {
                // If role is not in session, fetch from DB (for returning users)
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userDocRef);
                if (userDoc.exists) {
                    role = userDoc.data().role;
                } else if (user.email === 'profesor@profesor.cz') {
                    // FALLBACK for original admin
                    role = 'professor';
                } else {
                    role = 'student'; // Default for safety
                }
                sessionStorage.setItem('userRole', role);
            }

            if (role === 'professor') {
                renderMainLayout();
                await initProfessorApp(user);
            } else {
                if (typeof cleanupStudentDashboard === 'function') {
                    cleanupStudentDashboard();
                }
                initStudentApp();
            }
        } else {
            // User is signed out, clear session storage
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
