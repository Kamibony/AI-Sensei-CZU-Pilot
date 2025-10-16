import { initializeFirebase } from './firebase-init.js';
// --- OPRAVA: Importujeme správnu funkciu 'initAuth' ---
import { initAuth } from './auth.js';

function initializeAppUI() {
    const appContainer = document.getElementById('app-container');

    const login = async (role) => {
        if (!appContainer) return;
        
        // Načítanie hlavnej šablóny aplikácie
        const templateResponse = await fetch('/main-app-template.html');
        const templateHtml = await templateResponse.text();
        const template = document.createElement('template');
        template.innerHTML = templateHtml;
        
        appContainer.innerHTML = '';
        appContainer.appendChild(template.content.cloneNode(true));
        
        if (role === 'professor') {
            const { initProfessorDashboard } = await import('./professor.js');
            await initProfessorDashboard();
        } else {
            const { initStudentDashboard } = await import('./student.js');
            await initStudentDashboard();
        }
    };
    
    // --- OPRAVA: Voláme správnu funkciu 'initAuth' ---
    initAuth(appContainer, login);
}

// Spustenie celej aplikácie
initializeFirebase().then(() => {
    initializeAppUI();
}).catch(error => {
    console.error("Firebase initialization failed:", error);
    document.body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Critical error: Could not initialize Firebase.</p>';
});
