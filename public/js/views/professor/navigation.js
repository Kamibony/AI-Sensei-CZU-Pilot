import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export function setupProfessorNav(showProfessorContent) {
    const nav = document.getElementById('main-nav');
    const auth = getAuth();
    const user = auth.currentUser;

    if (nav && user) {
        // Modern Sidebar Container: White/Glass, floating feel, border-r
        nav.className = 'hidden md:flex fixed top-0 left-0 h-full w-20 lg:w-64 bg-white/90 backdrop-blur-xl border-r border-slate-100 z-50 flex-col justify-between transition-all duration-300';

        nav.innerHTML = `
            <!-- Top Section: Logo & Management -->
            <div class="flex flex-col w-full">
                <!-- Minimalist Logo -->
                <div id="nav-logo" class="h-20 flex items-center justify-center lg:justify-start lg:px-6 cursor-pointer group">
                    <div class="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-md shadow-indigo-200 font-bold text-lg flex-shrink-0 group-hover:scale-105 transition-transform">
                        A
                    </div>
                    <span class="ml-3 font-bold text-slate-800 text-lg hidden lg:block tracking-tight group-hover:text-indigo-600 transition-colors">
                        AI Sensei
                    </span>
                </div>

                <!-- Navigation Groups -->
                <div class="mt-4 space-y-1 px-3">

                    <!-- GROUP: ORGANIZACE -->
                    <div class="hidden lg:block px-4 mt-2 mb-2">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Organizace</span>
                    </div>

                    <button data-view="dashboard" class="nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group border-l-4 border-transparent">
                        <div class="w-10 h-10 flex items-center justify-center rounded-md flex-shrink-0">
                            <span class="text-xl transition-transform group-hover:scale-110">🏠</span>
                        </div>
                        <span class="ml-2 text-sm font-medium hidden lg:block">Dashboard</span>
                    </button>

                    <button data-view="classes" class="nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group border-l-4 border-transparent">
                        <div class="w-10 h-10 flex items-center justify-center rounded-md flex-shrink-0">
                            <span class="text-xl transition-transform group-hover:scale-110">🏫</span>
                        </div>
                        <span class="ml-2 text-sm font-medium hidden lg:block">Moje Třídy</span>
                    </button>

                    <button data-view="students" class="nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group border-l-4 border-transparent">
                        <div class="w-10 h-10 flex items-center justify-center rounded-md flex-shrink-0">
                            <span class="text-xl transition-transform group-hover:scale-110">👥</span>
                        </div>
                        <span class="ml-2 text-sm font-medium hidden lg:block">Studenti</span>
                    </button>

                    <button data-view="analytics" class="nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group border-l-4 border-transparent">
                        <div class="w-10 h-10 flex items-center justify-center rounded-md flex-shrink-0">
                            <span class="text-xl transition-transform group-hover:scale-110">📊</span>
                        </div>
                        <span class="ml-2 text-sm font-medium hidden lg:block">Analýza</span>
                    </button>

                     <button data-view="interactions" class="nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group border-l-4 border-transparent">
                        <div class="w-10 h-10 flex items-center justify-center rounded-md flex-shrink-0">
                            <span class="text-xl transition-transform group-hover:scale-110">💬</span>
                        </div>
                        <span class="ml-2 text-sm font-medium hidden lg:block">Interakce</span>
                    </button>
                </div>

                <!-- Spacer / Divider -->
                <div class="my-6 border-t border-slate-100 mx-6"></div>

                <!-- GROUP: TVŮRČÍ STUDIO -->
                <div class="space-y-1 px-3">
                    <div class="hidden lg:block px-4 mb-2">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tvůrčí Studio</span>
                    </div>

                     <button data-view="timeline" class="nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group border-l-4 border-transparent">
                        <div class="w-10 h-10 flex items-center justify-center rounded-md flex-shrink-0">
                            <span class="text-xl transition-transform group-hover:scale-110">📚</span>
                        </div>
                        <span class="ml-2 text-sm font-medium hidden lg:block">Knihovna Lekcí</span>
                    </button>

                    <button data-view="media" class="nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group border-l-4 border-transparent">
                        <div class="w-10 h-10 flex items-center justify-center rounded-md flex-shrink-0">
                            <span class="text-xl transition-transform group-hover:scale-110">📁</span>
                        </div>
                        <span class="ml-2 text-sm font-medium hidden lg:block">Média & Soubory</span>
                    </button>

                    <button data-view="editor" class="nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-50 hover:text-indigo-700 group border-l-4 border-transparent mt-2">
                        <div class="w-10 h-10 flex items-center justify-center rounded-md flex-shrink-0 relative">
                             <span class="absolute inset-0 bg-indigo-200 opacity-20 rounded-full blur-sm"></span>
                            <span class="text-xl transition-transform group-hover:scale-110 relative z-10">✨</span>
                        </div>
                        <span class="ml-2 text-sm font-bold hidden lg:block text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">AI Editor</span>
                    </button>
                </div>
            </div>

            <!-- Bottom Section: Profile & Logout -->
            <div class="p-4 border-t border-slate-100 space-y-1">
                 ${user.email === 'profesor@profesor.cz' ? `
                <button data-view="admin" class="nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 text-slate-400 hover:bg-yellow-50 hover:text-yellow-600 group border-l-4 border-transparent">
                     <div class="w-10 h-10 flex items-center justify-center rounded-md flex-shrink-0">
                        <span class="text-xl group-hover:rotate-90 transition-transform duration-500">⚙️</span>
                    </div>
                    <span class="ml-2 text-sm font-medium hidden lg:block">Admin</span>
                </button>
                ` : ''}

                <button id="logout-btn-nav" class="w-full flex items-center p-2 rounded-lg transition-all duration-200 text-slate-400 hover:bg-red-50 hover:text-red-600 group">
                    <div class="w-10 h-10 flex items-center justify-center rounded-md flex-shrink-0">
                        <span class="text-xl group-hover:translate-x-1 transition-transform">🚪</span>
                    </div>
                    <span class="ml-2 text-sm font-medium hidden lg:block">Odhlásit se</span>
                </button>
            </div>
        `;

        // Setup Click Listeners (Preserving logic)
        nav.querySelectorAll('button[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;

                // Reset all buttons
                nav.querySelectorAll('button[data-view]').forEach(b => {
                    // Reset classes to default inactive state
                    b.className = 'nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group border-l-4 border-transparent';

                    // Re-apply special styling for AI Editor if it's not active
                    if (b.dataset.view === 'editor') {
                         b.className = 'nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-50 hover:text-indigo-700 group border-l-4 border-transparent mt-2';
                    }
                });

                // Activate clicked button
                const activeBtn = e.currentTarget;

                // Base Active Class
                let activeClass = 'nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 bg-slate-50 text-indigo-600 font-semibold group border-l-4 border-indigo-500 shadow-sm';

                if (view === 'admin') {
                     activeClass = 'nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 bg-yellow-50 text-yellow-700 font-semibold group border-l-4 border-yellow-500 shadow-sm';
                } else if (view === 'editor') {
                    activeClass = 'nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 bg-indigo-50 text-indigo-700 font-bold group border-l-4 border-indigo-600 shadow-sm mt-2';
                }

                activeBtn.className = activeClass;

                showProfessorContent(view);
            });
        });

        // Logo Click to Dashboard
        const logo = nav.querySelector('#nav-logo');
        if (logo) {
            logo.addEventListener('click', () => {
                 // Reset navigation state visually
                nav.querySelectorAll('button[data-view]').forEach(b => {
                     b.className = 'nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group border-l-4 border-transparent';
                      if (b.dataset.view === 'editor') {
                         b.className = 'nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-50 hover:text-indigo-700 group border-l-4 border-transparent mt-2';
                    }
                });

                // Activate Dashboard Button
                const dashBtn = nav.querySelector('button[data-view="dashboard"]');
                if(dashBtn) {
                    dashBtn.className = 'nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 bg-slate-50 text-indigo-600 font-semibold group border-l-4 border-indigo-500 shadow-sm';
                }

                showProfessorContent('dashboard');
            });
        }
    }
}
