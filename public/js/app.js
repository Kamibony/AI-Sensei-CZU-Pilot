import { initializeFirebase, auth, db } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// --- OPRAVA NÁZVU IMPORTU ---
import { initProfessor } from './professor.js';
// ----------------------------
import { initStudentApp } from './student.js';
import { initAuth } from './auth.js';

// Hlavná funkcia pre bezpečný štart aplikácie
async function main() {
    try {
        // 1. Počkáme na dokončenie inicializácie Firebase
        await initializeFirebase();
        console.log("Firebase fully initialized, starting app...");
    } catch (error) {
        console.error("Firebase init failed:", error);
        document.body.innerHTML = `<div class="flex items-center justify-center h-screen text-red-600 bg-red-50">
            <div class="text-center">
                <h1 class="text-2xl font-bold mb-2">Chyba připojení</h1>
                <p>Nepodařilo se připojit k aplikaci. Zkuste obnovit stránku.</p>
            </div>
        </div>`;
        return;
    }

    // 2. Spustíme listenery pre auth (formuláre)
    initAuth();

    // 3. Sledujeme stav prihlásenia
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("User logged in:", user.uid);
            renderLoadingState(); // Zobrazíme loading, kým zistíme rolu

            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    const role = userDoc.data().role;
                    if (role === 'professor') {
                        // --- OPRAVA VOLANIA FUNKCIE ---
                        await initProfessor(user);
                        // ------------------------------
                    } else if (role === 'student') {
                         if (window.currentStudentCleanup) {
                            window.currentStudentCleanup();
                            window.currentStudentCleanup = null;
                        }
                        await initStudentApp(user);
                    } else {
                         renderErrorState("Neznámá uživatelská role.");
                    }
                } else {
                    // Fallback pre užívateľov bez profilu (napr. čistý Google login)
                    console.warn("No user profile found, showing login.");
                    renderLoginState();
                }
            } catch (error) {
                console.error("Error getting user role:", error);
                renderErrorState("Chyba při načítání profilu.");
            }
        } else {
            console.log("User logged out");
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

function renderErrorState(msg) {
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        appContainer.innerHTML = `<div class="flex items-center justify-center h-screen text-red-600">${msg}</div>`;
    }
}

// Štart
main();
