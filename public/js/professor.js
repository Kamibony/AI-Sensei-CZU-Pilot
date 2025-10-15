import { handleLogout } from './auth.js'; // OPRAVA: Importujeme funkciu na odhlásenie
import { setupProfessorNav } from './views/professor/navigation.js';
import { showTimeline } from './views/professor/timeline-view.js';
import { showStudents } from './views/professor/students-view.js';
import { showInteractions } from './views/professor/interactions-view.js';
import { showMediaLibrary } from './views/professor/media-library-view.js';
import { showAnalytics } from './views/professor/analytics-view.js';

let currentProfessorView = 'timeline';

function showProfessorContent(viewId) {
    const mainContentArea = document.getElementById('main-content-area');
    if (!mainContentArea) return;

    mainContentArea.innerHTML = '';
    currentProfessorView = viewId;

    switch (viewId) {
        case 'timeline':
            showTimeline(mainContentArea);
            break;
        case 'students':
            showStudents(mainContentArea);
            break;
        case 'interactions':
            showInteractions(mainContentArea);
            break;
        case 'media':
            showMediaLibrary(mainContentArea);
            break;
        case 'analytics':
            showAnalytics(mainContentArea);
            break;
        default:
            mainContentArea.innerHTML = `<div class="p-8"><h2 class="text-2xl font-bold">Obsah pro '${viewId}' se připravuje.</h2></div>`;
    }
}

export async function initProfessorDashboard() {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    roleContentWrapper.innerHTML = `
        <div class="flex-grow flex h-screen">
            <aside id="professor-sidebar" class="w-72 bg-white border-r border-slate-200 flex flex-col flex-shrink-0"></aside>
            <main id="main-content-area" class="flex-grow bg-slate-50 overflow-y-auto"></main>
        </div>
    `;
    
    // OPRAVA: Posielame 'handleLogout' do navigačnej funkcie
    setupProfessorNav(showProfessorContent, handleLogout); 
    
    // Zobrazenie východiskového pohľadu
    showProfessorContent(currentProfessorView);
}
