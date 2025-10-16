import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirebase } from './firebase-init.js';
import { initAuth } from './auth.js';
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
            
            // --- KĽÚČOVÁ OPRAVA: Načítanie hlavnej šablóny aplikácie ---
            // Tento krok chýbal a spôsoboval, že sa panel nezobrazil.
            const templateResponse = await fetch('/main-app-template.html');
            const templateHtml = await templateResponse.text();
            const template = document.createElement('template');
            template.innerHTML = templateHtml;
            appContainer.innerHTML = '';
            appContainer.appendChild(template.content.cloneNode(true));
            // --- KONIEC KĽÚČOVEJ OPRAVY ---

            // Teraz, keď je šablóna načítaná, môžeme zobraziť správny panel.
            if (user.email === 'profesor@profesor.cz') {
                console.log("Professor identified. Loading professor dashboard.");
                await initProfessorDashboard();
            } else {
                console.log("Student identified. Loading student dashboard.");
                await initStudentDashboard();
            }

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
