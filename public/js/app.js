import { startAuthFlow, handleLogout } from './auth.js';
import { showToast } from './utils.js';

export function initializeAppUI(auth, db, storage, functions) {
    const appContainer = document.getElementById('app-container');

    const login = async (role) => {
        if (!appContainer) return;
        const template = document.getElementById('main-app-template');
        appContainer.innerHTML = '';
        appContainer.appendChild(template.content.cloneNode(true));
        document.getElementById('logout-btn').addEventListener('click', handleLogout);

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
