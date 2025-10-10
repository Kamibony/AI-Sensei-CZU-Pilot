import { initializeFirebase } from './firebase-init.js';
import { startAuthFlow } from './auth.js';

function initializeAppUI() {
    const appContainer = document.getElementById('app-container');

    const login = async (role) => {
        if (!appContainer) return;
        const template = document.getElementById('main-app-template');
        appContainer.innerHTML = '';
        appContainer.appendChild(template.content.cloneNode(true));
        
        // Tento riadok spôsoboval chybu a bol odstránený, pretože logout sa teraz rieši v professor.js a student.js
        // document.getElementById('logout-btn').addEventListener('click', handleLogout);

        if (role === 'professor') {
            const { initProfessorDashboard } = await import('./professor.js');
            await initProfessorDashboard();
        } else {
            const { initStudentDashboard } = await import('./student.js');
            await initStudentDashboard();
        }
    };
    
    startAuthFlow(login);
}

// Start the entire application
initializeFirebase().then(() => {
    initializeAppUI();
});
