import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export function setupProfessorNav(showProfessorContent) {
    const nav = document.getElementById('main-nav');
    const auth = getAuth();
    const user = auth.currentUser;

    if (nav && user) {
        // Apply sidebar styling to the container
        nav.className = 'hidden md:flex fixed top-0 left-0 h-full w-20 lg:w-72 bg-slate-900 border-r border-slate-800 z-50 flex-col transition-all duration-300';

        nav.innerHTML = `
            <!-- Logo Section -->
            <div id="nav-logo" class="p-6 flex items-center justify-center lg:justify-start border-b border-slate-800 cursor-pointer hover:bg-slate-800 transition-colors">
                <div class="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-green-900/20 flex-shrink-0">
                    <span class="text-xl">🎓</span>
                </div>
                <div class="ml-3 hidden lg:block">
                    <h1 class="text-lg font-bold text-white tracking-tight">AI Sensei</h1>
                    <p class="text-xs text-slate-400 font-medium">Professor Dashboard</p>
                </div>
            </div>

            <!-- Navigation Items -->
            <div class="flex-1 overflow-y-auto py-6 px-3 space-y-2">

                <div class="px-4 mb-2 hidden lg:block">
                    <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Menu</p>
                </div>

                <button data-view="timeline" class="nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-400 hover:bg-slate-800 hover:text-white group relative overflow-hidden">
                    <div class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-green-500 rounded-r-full opacity-0 transition-opacity duration-200"></div>
                    <span class="text-xl group-hover:scale-110 transition-transform relative z-10">🗓️</span>
                    <span class="ml-3 font-medium hidden lg:block relative z-10">Plán výuky</span>
                </button>

                <button data-view="classes" class="nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-400 hover:bg-slate-800 hover:text-white group relative overflow-hidden">
                    <div class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-green-500 rounded-r-full opacity-0 transition-opacity duration-200"></div>
                    <span class="text-xl group-hover:scale-110 transition-transform relative z-10">🏫</span>
                    <span class="ml-3 font-medium hidden lg:block relative z-10">Třídy</span>
                </button>

                <button data-view="students" class="nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-400 hover:bg-slate-800 hover:text-white group relative overflow-hidden">
                    <div class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-green-500 rounded-r-full opacity-0 transition-opacity duration-200"></div>
                    <span class="text-xl group-hover:scale-110 transition-transform relative z-10">👥</span>
                    <span class="ml-3 font-medium hidden lg:block relative z-10">Studenti</span>
                </button>

                <button data-view="interactions" class="nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-400 hover:bg-slate-800 hover:text-white group relative overflow-hidden">
                    <div class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-green-500 rounded-r-full opacity-0 transition-opacity duration-200"></div>
                    <span class="text-xl group-hover:scale-110 transition-transform relative z-10">💬</span>
                    <span class="ml-3 font-medium hidden lg:block relative z-10">Interakce</span>
                </button>

                <button data-view="analytics" class="nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-400 hover:bg-slate-800 hover:text-white group relative overflow-hidden">
                    <div class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-green-500 rounded-r-full opacity-0 transition-opacity duration-200"></div>
                    <span class="text-xl group-hover:scale-110 transition-transform relative z-10">📊</span>
                    <span class="ml-3 font-medium hidden lg:block relative z-10">Analýza</span>
                </button>

                <button data-view="media" class="nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-400 hover:bg-slate-800 hover:text-white group relative overflow-hidden">
                    <div class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-green-500 rounded-r-full opacity-0 transition-opacity duration-200"></div>
                    <span class="text-xl group-hover:scale-110 transition-transform relative z-10">📁</span>
                    <span class="ml-3 font-medium hidden lg:block relative z-10">Knihovna</span>
                </button>
            </div>

            <!-- Bottom Section -->
            <div class="p-4 border-t border-slate-800 space-y-2">
                 ${user.email === 'profesor@profesor.cz' ? `
                <button data-view="admin" class="nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-400 hover:bg-yellow-900/20 hover:text-yellow-400 group relative">
                    <span class="text-xl group-hover:scale-110 transition-transform">⚙️</span>
                    <span class="ml-3 font-medium hidden lg:block">Admin</span>
                </button>
                ` : ''}

                <button id="logout-btn-nav" class="w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-400 hover:bg-red-900/20 hover:text-red-400 group relative">
                    <span class="text-xl group-hover:scale-110 transition-transform">🚪</span>
                    <span class="ml-3 font-medium hidden lg:block">Odhlásit se</span>
                </button>
            </div>
        `;

        // Setup Click Listeners
        nav.querySelectorAll('button[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;

                // Reset all buttons
                nav.querySelectorAll('button[data-view]').forEach(b => {
                    // Reset basic classes
                    b.className = 'nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-400 hover:bg-slate-800 hover:text-white group relative overflow-hidden';
                    // Hide active indicator
                    const indicator = b.querySelector('div.absolute');
                    if(indicator) indicator.classList.add('opacity-0');
                    if(indicator) indicator.classList.remove('opacity-100');
                });

                // Activate clicked button
                const activeBtn = e.currentTarget;
                if (view === 'admin') {
                     activeBtn.className = 'nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 bg-yellow-900/20 text-yellow-400 group relative overflow-hidden';
                } else {
                     activeBtn.className = 'nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 bg-slate-800 text-green-400 group relative overflow-hidden';
                     const indicator = activeBtn.querySelector('div.absolute');
                     if(indicator) indicator.classList.remove('opacity-0');
                     if(indicator) indicator.classList.add('opacity-100');
                }

                showProfessorContent(view);
            });
        });

        // Logo Click to Dashboard
        const logo = nav.querySelector('#nav-logo');
        if (logo) {
            logo.addEventListener('click', () => {
                // Reset navigation state
                nav.querySelectorAll('button[data-view]').forEach(b => {
                    b.className = 'nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-400 hover:bg-slate-800 hover:text-white group relative overflow-hidden';
                    const indicator = b.querySelector('div.absolute');
                    if(indicator) indicator.classList.add('opacity-0');
                });
                showProfessorContent('dashboard');
            });
        }

    }
}
