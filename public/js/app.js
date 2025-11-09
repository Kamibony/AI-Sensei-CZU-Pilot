import { initializeFirebase, auth, db } from './firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { initProfessorApp } from './professor.js';
import { initStudentApp } from './student.js';
import { initAuth } from './auth.js';

// Hlavná funkcia, ktorá naštartuje celú aplikáciu
async function main() {
    // 1. Najprv počkáme na úplnú inicializáciu Firebase
    try {
        await initializeFirebase();
        console.log("Firebase fully initialized in app.js");
    } catch (error) {
        console.error("CRITICAL: Firebase initialization failed:", error);
        document.body.innerHTML = '<div style="color: red; padding: 20px; text-align: center;">Chyba aplikace: Nepodařilo se připojit k serveru. Zkuste obnovit stránku.</div>';
        return; // Končíme, nemá zmysel pokračovat
    }

    // 2. Inicializujeme listenery pro přihlášení/registraci
    initAuth();

    // 3. Nastavíme sledování stavu přihlášení
    // Použijeme 'auth' importovaný z firebase-init.js, který je teď už určitě nastavený
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log(`User signed in: ${user.uid} (${user.email})`);
            
            // Zobraziť nejaký loading, kým zistíme rolu
            renderLoadingState();

            try {
                // Zistiť rolu užívateľa z Firestore
                const userDocRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userDocRef);

                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    const role = userData.role;
                    console.log(`User role: ${role}`);

                    if (role === 'professor') {
                        await initProfessorApp(user);
                    } else if (role === 'student') {
                         // Pre istotu odpojíme staré listenery ak nejaké boli
                        if (window.currentStudentCleanup) {
                            window.currentStudentCleanup();
                            window.currentStudentCleanup = null;
                        }
                        await initStudentApp(user);
                    } else {
                        console.error("Unknown role:", role);
                        renderErrorState("Váš účet nemá nastavenou platnou roli.");
                    }
                } else {
                    // Pokud dokument uživatele neexistuje (např. nový Google přihlášení),
                    // musíme ho vytvořit. Prozatím předpokládejme, že Google login = profesor,
                    // nebo zobrazíme chybu, pokud se mají registrovat jen přes formulář.
                    console.warn("User document does not exist in Firestore.");
                    
                    // Zde by mohla být logika pro automatické vytvoření profilu,
                    // pokud to vaše aplikace dovoluje. Pro teď zobrazíme login.
                    // signOut(auth); // Volitelné: odhlásit, pokud nemá profil
                    renderLoginState(); 
                }
            } catch (error) {
                console.error("Error fetching user role:", error);
                renderErrorState("Chyba při načítání profilu uživatele.");
            }
        } else {
            console.log("No user signed in. Showing login form.");
            renderLoginState();
        }
    });
}

// Pomocná funkcia na zobrazenie loginu
function renderLoginState() {
    const appContainer = document.getElementById('app-container');
    const loginTemplate = document.getElementById('login-template');
    
    if (appContainer && loginTemplate) {
        appContainer.innerHTML = '';
        appContainer.appendChild(loginTemplate.content.cloneNode(true));
    }
}

// Pomocná funkcia na zobrazenie loadingu
function renderLoadingState() {
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        appContainer.innerHTML = '<div class="flex items-center justify-center h-screen"><div class="text-xl text-slate-600">Načítám aplikaci...</div></div>';
    }
}

// Pomocná funkcia na zobrazenie chyby
function renderErrorState(message) {
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        appContainer.innerHTML = `<div class="flex items-center justify-center h-screen"><div class="text-red-600 bg-red-100 p-4 rounded-lg">${message}</div></div>`;
    }
}

// Spustenie aplikácie
main();
