import { handleLogout } from '../../auth.js';

export async function setupStudentNav() {
    const nav = document.getElementById('main-nav');
    if(nav) {
        nav.classList.add('hidden', 'md:flex');
        nav.innerHTML = `
            <div class="flex flex-col h-full">
                <div class="flex-grow space-y-4">
                    <li><button class="nav-item p-3 rounded-lg flex items-center justify-center text-white bg-green-700" title="Moje studium"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></button></li>
                </div>
                <div>
                    <li><button id="logout-btn-nav" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-red-700 hover:text-white" title="Odhlásit se"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg></button></li>
                </div>
            </div>`;
        document.getElementById('logout-btn-nav').addEventListener('click', handleLogout);
    }

    const mobileNav = document.getElementById('mobile-bottom-nav');
    if (mobileNav) {
        mobileNav.innerHTML = `
            <button class="flex flex-col items-center text-slate-500 p-2 mobile-nav-active">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                <span class="text-xs mt-1">Lekce</span>
            </button>
            <button id="mobile-logout-btn" class="flex flex-col items-center text-slate-500 p-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                <span class="text-xs mt-1">Odhlásit se</span>
            </button>
        `;
        document.getElementById('mobile-logout-btn').addEventListener('click', handleLogout);
    }
}