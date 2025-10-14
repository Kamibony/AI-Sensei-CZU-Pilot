// public/js/views/student/navigation.js

import { showStudentContent } from '../../student.js';
import { handleLogout } from '../../auth.js';

const navIcons = {
    overview: {
        path: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
        viewBox: "0 0 24 24" // --- OPRAVA: Tento riadok tu chýbal ---
    },
    chat: {
        path: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
        viewBox: "0 0 24 24"
    },
};

function createIcon(iconName) {
    const icon = navIcons[iconName];
    if (!icon) return '';
    const viewBox = icon.viewBox || "0 0 24 24"; 
    return `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="${icon.path}"></path>
        </svg>
    `;
}

export function setupStudentNav(studentData) {
    const mainView = document.querySelector('.main-view');
    if (!mainView) return;

    if (mainView.querySelector('nav')) {
        return;
    }

    const navElement = document.createElement('nav');
    navElement.className = "w-64 bg-green-800 text-white flex-col h-screen flex-shrink-0";
    navElement.innerHTML = `
        <div class="p-4 border-b border-green-700">
            <h1 class="text-2xl font-bold">AI Sensei</h1>
            <p class="text-sm text-green-200">Panel Studenta</p>
        </div>
        <div class="flex-grow p-2">
            <a href="#" class="nav-link flex items-center p-2 rounded-lg hover:bg-green-700" data-view="overview">${createIcon('overview')}<span class="ml-3">Přehled</span></a>
            <a href="#" class="nav-link flex items-center p-2 rounded-lg hover:bg-green-700" data-view="chat">${createIcon('chat')}<span class="ml-3">Chat s AI</span></a>
        </div>
        <div class="p-4 border-t border-green-700">
            <div class="flex items-center mb-4">
                <div class="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center font-bold mr-3">${studentData.name.charAt(0)}</div>
                <span>${studentData.name}</span>
            </div>
            <button id="logout-btn" class="w-full text-left p-2 rounded-lg hover:bg-green-700">Odhlásit se</button>
        </div>
    `;

    mainView.prepend(navElement);

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showStudentContent(link.dataset.view);
        });
    });

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}
