import { initializeFirebase } from '/js/firebase-init.js';
import { startAuthFlow, handleLogout } from '/js/auth.js';

function initializeAppUI() {
    const appContainer = document.getElementById('app-container');

    const login = async (role) => {
        if (!appContainer) return;
        const template = document.getElementById('main-app-template');
        if (!template) return;

        appContainer.innerHTML = '';
        appContainer.appendChild(template.content.cloneNode(true));
        
        if (role === 'professor') {
            const { initProfessorDashboard } = await import('/js/professor.js');
            await initProfessorDashboard();
        } else {
            const { initStudentDashboard } = await import('/js/student.js');
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
