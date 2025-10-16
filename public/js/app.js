import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirebase } from './firebase-init.js';
import { initAuth } from './auth.js';
import { initProfessorDashboard } from './professor.js';
import { initStudentDashboard, cleanupStudentDashboard } from './student.js';

// Inicializácia Firebase a získanie referencií
initializeFirebase();
const auth = getAuth();
const appContainer = document.getElementById('app-container');

// Centrálny listener pre stav prihlásenia (hlavná logika aplikácie)
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Používateľ je prihlásený. Teraz zistíme, či je to profesor.
        appContainer.innerHTML = '<div class="spinner-container"><div class="spinner"></div></div>'; // Zobrazí načítavanie

        // --- Logika pre rozpoznanie Profesora podľa emailu ---
        if (user.email === 'profesor@profesor.cz') {
            // Ak sa email zhoduje, je to profesor
            console.log("Professor identified. Loading professor dashboard.");
            await initProfessorDashboard();
        } else {
            // Inak je to študent
            console.log("Student identified. Loading student dashboard.");
            await initStudentDashboard();
        }

    } else {
        // Používateľ nie je prihlásený.
        console.log("No user signed in. Showing login form.");
        
        // Vyčistíme listenery, ak by nejaké zostali po odhlásení
        if (typeof cleanupStudentDashboard === 'function') {
            cleanupStudentDashboard();
        }

        // Zobrazíme prihlasovací/registračný formulár
        initAuth(appContainer);
    }
});
