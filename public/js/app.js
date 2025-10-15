import { initializeFirebase } from './firebase-init.js';
import { startAuthFlow } from './auth.js';

function initializeAppUI() {
    console.log("Krok 2: Spúšťam initializeAppUI()."); // DIAGNOSTIKA
    const appContainer = document.getElementById('app-container');

    const login = async (role) => {
        console.log(`Krok 4: Spustil sa login callback s rolou: ${role}`); // DIAGNOSTIKA
        if (!appContainer) {
            console.error("CHYBA: Element 'app-container' nebol nájdený!");
            return;
        }
        const template = document.getElementById('main-app-template');
        if (!template) {
            console.error("CHYBA: Šablóna 'main-app-template' nebola nájdená!");
            return;
        }

        appContainer.innerHTML = '';
        appContainer.appendChild(template.content.cloneNode(true));
        
        if (role === 'professor') {
            console.log("Načítavam profesorský panel..."); // DIAGNOSTIKA
            const { initProfessorDashboard } = await import('./professor.js');
            await initProfessorDashboard();
        } else {
            console.log("Načítavam študentský panel..."); // DIAGNOSTIKA
            const { initStudentDashboard } = await import('./student.js');
            await initStudentDashboard();
        }
        console.log("Krok 5: Zobrazenie panelu by malo byť dokončené."); // DIAGNOSTIKA
    };
    
    console.log("Krok 3: Volám startAuthFlow()..."); // DIAGNOSTIKA
    startAuthFlow(login);
}

// Spustenie celej aplikácie
console.log("Krok 1: Inicializujem Firebase..."); // DIAGNOSTIKA
initializeFirebase().then(() => {
    initializeAppUI();
}).catch(error => {
    console.error("Firebase initialization failed:", error);
    document.body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Kritická chyba: Nepodarilo sa inicializovať Firebase.</p>';
});
