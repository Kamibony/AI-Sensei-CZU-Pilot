// Zmena z /js/... na ./...
import { initializeFirebase } from './firebase-init.js';
import { startAuthFlow, handleLogout } from './auth.js';

function initializeAppUI() {
    const appContainer = document.getElementById('app-container');

    const login = async (role) => {
        if (!appContainer) return;
        const template = document.getElementById('main-app-template');
        if (!template) return;

        appContainer.innerHTML = '';
        appContainer.appendChild(template.content.cloneNode(true));
        
        if (role === 'professor') {
            // Zmena z /js/... na ./...
            const { initProfessorDashboard } = await import('./professor.js');
            await initProfessorDashboard();
        } else {
            // Zmena z /js/... na ./...
            const { initStudentDashboard } = await import('./student.js');
            await initStudentDashboard();
        }
    };
    
    startAuthFlow(login);
}

// Spustenie celej aplikácie
initializeFirebase().then(() => {
    initializeAppUI();
}).catch(error => {
    console.error("Firebase initialization failed:", error);
    document.body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Critical error: Could not initialize Firebase.</p>';
});
