// Súbor: public/js/app.js
// Verzia: Plná, rešpektujúca pôvodnú štruktúru + Smerovanie podľa rolí

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirebase } from './firebase-init.js';
// --- OPRAVA: Pridaný import handleLogout ---
import { initAuth, handleLogout } from './auth.js'; 
import { initProfessorDashboard } from './professor.js';
import { initStudentDashboard, cleanupStudentDashboard } from './student.js';

// Hlavná funkcia aplikácie, ktorá sa spustí až po inicializácii Firebase
function startApp() {
    const auth = getAuth();
    const appContainer = document.getElementById('app-container');

    // Centrálny listener pre stav prihlásenia
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Používateľ je prihlásený.

            // --- NOVÁ LOGIKA: Získanie roly ---
            // true = vynúti obnovenie tokenu, aby sme mali čerstvé Custom Claims
            const idTokenResult = await user.getIdTokenResult(true); 
            const userRole = idTokenResult.claims.role;
            // ---------------------------------
            
            const template = document.getElementById('main-app-template');
            if (!template) {
                console.error("Kritická chyba: Šablóna 'main-app-template' nebola nájdená v index.html!");
                appContainer.innerHTML = "<p>Chyba: Chybí hlavní šablona aplikace.</p>";
                return;
            }
            appContainer.innerHTML = '';
            appContainer.appendChild(template.content.cloneNode(true));

            // --- UPRAVENÁ LOGIKA: Smerovanie podľa roly ---
            // Ponecháme email 'profesor@profesor.cz' ako Super Admina
            // A pridáme kontrolu pre kohokoľvek s rolou 'professor'
            if (user.email === 'profesor@profesor.cz' || userRole === 'professor') {
                console.log("Professor/Admin identified. Loading professor dashboard.");
                // Posielame celý objekt 'user', aby mal professor.js UID aj email
                await initProfessorDashboard(user); 
            } else {
                console.log("Student identified. Loading student dashboard.");
                await initStudentDashboard();
            }
            // -------------------------------------------

        } else {
            // Používateľ nie je prihlásený.
            console.log("No user signed in. Showing login form.");
            
            if (typeof cleanupStudentDashboard === 'function') {
                cleanupStudentDashboard();
            }

            initAuth(appContainer);
        }
    });
}

// Spustenie inicializácie a následne hlavnej logiky aplikácie
initializeFirebase().then(() => {
    startApp();
}).catch(error => {
    console.error("Firebase initialization failed:", error);
    document.body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Critical error: Could not initialize Firebase.</p>';
});
