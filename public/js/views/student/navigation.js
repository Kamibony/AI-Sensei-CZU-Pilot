import { handleSignOut } from '../../auth.js'; // OPRAVA: Zmenený názov z handleLogout na handleSignOut
import { showStudentContent } from '../../student.js';

export function setupStudentNav(studentData) {
    const mainNav = document.getElementById('main-nav');
    const mobileNav = document.getElementById('mobile-bottom-nav');
    const roleContentWrapper = document.getElementById('role-content-wrapper');

    if (!mainNav || !mobileNav || !roleContentWrapper) {
        console.error("Chybějící navigační prvky v DOM.");
        return;
    }
    
    mainNav.classList.remove('hidden');

    const navItems = [
        { id: 'overview', icon: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z', label: 'Přehled' },
        { id: 'chat', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', label: 'Chat s AI' },
        { id: 'professor-chat', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z', label: 'Chat s profesorem' },
        { id: 'telegram', icon: 'm22 2-7 20-4-9-9-4 20-7z', label: 'Telegram' }
    ];

    const navHtml = `
        <div class="flex flex-col items-center justify-between h-full py-4">
            <div>
                <a href="#" class="block text-white mb-8">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>
                </a>
                <div class="space-y-4">
                    ${navItems.map(item => `
                        <a href="#" class="nav-link w-12 h-12 flex items-center justify-center rounded-lg text-slate-400 hover:bg-green-700 hover:text-white" data-view="${item.id}" title="${item.label}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${item.icon}"></path></svg>
                        </a>
                    `).join('')}
                </div>
            </div>
            <div>
                <a href="#" id="logout-btn" class="w-12 h-12 flex items-center justify-center rounded-lg text-slate-400 hover:bg-green-700 hover:text-white" title="Odhlásit se">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </a>
            </div>
        </div>
    `;

    mainNav.innerHTML = navHtml;
    
    const mobileNavHtml = `
         ${navItems.map(item => `
            <a href="#" class="flex-1 text-center p-2 nav-link" data-view="${item.id}">
                 <svg xmlns="http://www.w3.org/2000/svg" class="mx-auto mb-1" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${item.icon}"></path></svg>
                <span class="text-xs">${item.label}</span>
            </a>
        `).join('')}
    `;
    mobileNav.innerHTML = mobileNavHtml;
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = link.dataset.view;
            showStudentContent(view, studentData);

            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    document.getElementById('logout-btn').addEventListener('click', (e) => {
        e.preventDefault();
        handleSignOut();
    });

    // Nastavení výchozího pohledu
    const initialLink = document.querySelector('.nav-link[data-view="overview"]');
    if (initialLink) {
        initialLink.classList.add('active');
    }
}
