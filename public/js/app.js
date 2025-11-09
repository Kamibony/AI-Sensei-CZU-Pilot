import { initializeFirebase, auth, db } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// --- ZJEDNOTENÉ IMPORTY (TERAZ UŽ MUSIA SEDIEŤ) ---
import { initProfessorApp } from './professor.js';
import { initStudentApp, cleanupStudentDashboard } from './student.js';
// --------------------------------------------------
import { initAuth } from './auth.js';

// Hlavní funkce pro bezpečný start aplikace
async function main() {
    try {
        // 1. Počkáme na dokončení inicializace Firebase
        await initializeFirebase();
        console.log("Firebase fully initialized, starting app...");
    } catch (error) {
        console.error("Firebase init failed:", error);
        document.body.innerHTML = `<div class="flex items-center justify-center h-screen text-red-600 bg-red-50">
            <div class="text-center p-8 bg-white rounded-2xl shadow-xl">
                <h1 class="text-2xl font-bold mb-4">Chyba připojení</h1>
                <p class="mb-4">Nepodařilo se připojit k aplikaci. Zkuste obnovit stránku.</p>
            </div>
        </div>`;
        return;
    }

    // 2. Spustíme listenery pro auth (formuláře)
    initAuth();

    // 3. Sledujeme stav přihlášení
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("User logged in:", user.uid);
            renderLoadingState(); 

            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (userDoc.exists()) {
                    const role = userDoc.data().role;
                    console.log("Role found:", role);

                    if (role === 'professor') {
                        // --- VOLANIE PROFESORA ---
                        await initProfessorApp(user);
                    } else if (role === 'student') {
                         // --- VOLANIE ŠTUDENTA ---
                         // Pre istotu vyčistíme starý stav
                        cleanupStudentDashboard();
                        initStudentApp(); // Už bez 'user', zistí si ho sám
                    } else {
                         console.error("Unknown role:", role);
                         renderErrorState("Neznámá uživatelská role.");
                    }
                } else {
                    console.warn("No user profile found in Firestore.");
                     renderErrorState("Uživatelský profil nenalezen.");
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
        appContainer.innerHTML = `<div class="flex items-center justify-center h-screen text-red-600 bg-red-50 p-8">
            <div class="text-center">
                <h2 class="text-xl font-bold mb-2">Chyba</h2>
                <p>${msg}</p>
            </div>
        </div>`;
    }
}

main();
