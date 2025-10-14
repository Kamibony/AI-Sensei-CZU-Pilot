import { initializeFirebase } from './firebase-init.js';
import { setupAuth as startAuthFlow, handleSignOut as handleLogout } from './auth.js';

function initializeAppUI() {
    const login = async (role, user = null) => {
        const appContainer = document.getElementById('app-container');
        const mainAppTemplate = document.getElementById('main-app-template');

        if (!appContainer || !mainAppTemplate) return;

        appContainer.innerHTML = '';
        appContainer.appendChild(mainAppTemplate.content.cloneNode(true));
        
        if (role === 'professor') {
            const { initProfessorDashboard } = await import('./professor.js');
            await initProfessorDashboard();
        } else if (role === 'student') {
            const { initStudentDashboard } = await import('./student.js');
            await initStudentDashboard(user);
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
