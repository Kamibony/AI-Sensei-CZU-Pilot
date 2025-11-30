import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { translationService } from "../../utils/translation-service.js";

export function setupProfessorNav(showProfessorContent) {
    const nav = document.getElementById('main-nav');
    const auth = getAuth();
    const user = auth.currentUser;
    const t = (key) => translationService.t(key);

    if (nav && user) {
        // Modern Sidebar: Clean, white, no heavy borders
        nav.className = 'hidden md:flex fixed top-0 left-0 h-screen w-64 bg-white border-r border-slate-100 z-50 flex-col justify-between transition-all duration-300';

        nav.innerHTML = `
            <div id="nav-logo" class="h-20 flex items-center justify-start px-6 cursor-pointer group flex-shrink-0">
                <div class="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-md shadow-indigo-200 font-bold text-lg flex-shrink-0 group-hover:scale-105 transition-transform">
                    A
                </div>
                <span class="ml-3 font-bold text-slate-800 text-lg tracking-tight group-hover:text-indigo-600 transition-colors">
                    AI Sensei
                </span>
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar flex flex-col w-full px-4">
                <div class="mt-6 space-y-1">

                    <div class="px-2 mt-2 mb-2">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">${t('nav.organization')}</span>
                    </div>

                    <button data-view="dashboard" class="nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group">
                        <span class="text-xl mr-3 group-hover:scale-110 transition-transform">🏠</span>
                        <span class="text-sm font-medium">${t('nav.dashboard')}</span>
                    </button>

                    <button data-view="classes" class="nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group">
                        <span class="text-xl mr-3 group-hover:scale-110 transition-transform">🏫</span>
                        <span class="text-sm font-medium">${t('nav.classes')}</span>
                    </button>

                    <button data-view="students" class="nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group">
                        <span class="text-xl mr-3 group-hover:scale-110 transition-transform">👥</span>
                        <span class="text-sm font-medium">${t('nav.students')}</span>
                    </button>

                    <button data-view="interactions" class="nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group">
                        <span class="text-xl mr-3 group-hover:scale-110 transition-transform">💬</span>
                        <span class="text-sm font-medium">${t('nav.interactions')}</span>
                    </button>

                    <button data-view="analytics" class="nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group">
                        <span class="text-xl mr-3 group-hover:scale-110 transition-transform">📊</span>
                        <span class="text-sm font-medium">${t('nav.analytics')}</span>
                    </button>

                    <div class="my-6 border-t border-slate-100 mx-2"></div>

                    <div class="px-2 mb-2">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">${t('nav.creative_studio')}</span>
                    </div>

                     <button data-view="timeline" class="nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group">
                        <span class="text-xl mr-3 group-hover:scale-110 transition-transform">📚</span>
                        <span class="text-sm font-medium">${t('nav.library')}</span>
                    </button>

                    <button data-view="media" class="nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group">
                        <span class="text-xl mr-3 group-hover:scale-110 transition-transform">📁</span>
                        <span class="text-sm font-medium">${t('nav.media')}</span>
                    </button>

                    <button data-view="editor" class="nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group">
                        <span class="text-xl mr-3 group-hover:scale-110 transition-transform">✨</span>
                        <span class="text-sm font-medium">${t('nav.editor')}</span>
                    </button>
                </div>
            </div>

            <div class="flex-shrink-0 p-4 border-t border-slate-100">
                 ${user.email === 'profesor@profesor.cz' ? `
                <button data-view="admin" class="nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-400 hover:bg-yellow-50 hover:text-yellow-600 group mb-2">
                    <span class="text-xl mr-3 group-hover:rotate-90 transition-transform duration-500">⚙️</span>
                    <span class="text-sm font-medium">${t('nav.admin')}</span>
                </button>
                ` : ''}
            </div>
        `;

        // Setup Click Listeners
        nav.querySelectorAll('button[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;

                // Reset all buttons (Standard style)
                nav.querySelectorAll('button[data-view]').forEach(b => {
                    b.className = 'nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group';
                });

                // Activate clicked button (Active style - No borders, just background)
                const activeBtn = e.currentTarget;
                let activeClass = 'nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 bg-indigo-50 text-indigo-700 font-bold shadow-sm group';

                if (view === 'admin') {
                     activeClass = 'nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 bg-yellow-50 text-yellow-700 font-bold shadow-sm group';
                }

                activeBtn.className = activeClass;
                showProfessorContent(view);
            });
        });

        // Logo Click to Dashboard
        const logo = nav.querySelector('#nav-logo');
        if (logo) {
            logo.addEventListener('click', () => {
                const dashBtn = nav.querySelector('button[data-view="dashboard"]');
                if(dashBtn) dashBtn.click();
            });
        }
        
        // Default active state for dashboard on load if needed
        const defaultBtn = nav.querySelector('button[data-view="dashboard"]');
        if(defaultBtn && !document.querySelector('.nav-item.bg-indigo-50')) {
             defaultBtn.className = 'nav-item w-full flex items-center p-3 rounded-xl transition-all duration-200 bg-indigo-50 text-indigo-700 font-bold shadow-sm group';
        }
    }
}
