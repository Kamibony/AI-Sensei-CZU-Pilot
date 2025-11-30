import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { translationService } from "../../utils/translation-service.js";

export function setupProfessorNav(showProfessorContent) {
    const nav = document.getElementById('main-nav');
    const contentWrapper = document.getElementById('role-content-wrapper');
    const auth = getAuth();
    const user = auth.currentUser;
    const t = (key) => translationService.t(key);

    if (nav && user) {
        // 1. Sidebar Styling: Fixed position, full height, width 64 (256px)
        nav.className = 'hidden md:flex fixed top-0 left-0 h-screen w-64 bg-white border-r border-slate-100 z-50 flex-col justify-between transition-all duration-300';
        
        // 2. Content Layout Fix: Push content to the right by exactly sidebar width (md:ml-64)
        if (contentWrapper) {
            contentWrapper.className = 'flex-grow flex flex-col overflow-y-auto md:ml-64 bg-slate-50 min-h-screen transition-all duration-300';
        }

        nav.innerHTML = `
            <div id="nav-logo" class="h-20 flex items-center justify-start px-6 cursor-pointer group flex-shrink-0 border-b border-transparent">
                <div class="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-md shadow-indigo-200 font-bold text-lg flex-shrink-0 group-hover:scale-105 transition-transform">
                    A
                </div>
                <span class="ml-3 font-bold text-slate-800 text-lg tracking-tight group-hover:text-indigo-600 transition-colors">
                    AI Sensei
                </span>
            </div>

            <div class="flex-1 overflow-y-auto custom-scrollbar flex flex-col w-full px-3 py-4 space-y-1">
                
                <div class="px-3 mb-2 mt-2">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">${t('nav.organization')}</span>
                </div>

                ${renderNavButton('dashboard', '🏠', t('nav.dashboard'))}
                ${renderNavButton('classes', '🏫', t('nav.classes'))}
                ${renderNavButton('students', '👥', t('nav.students'))}
                ${renderNavButton('interactions', '💬', t('nav.interactions'))}
                ${renderNavButton('analytics', '📊', t('nav.analytics'))}

                <div class="my-4 border-t border-slate-100 mx-3"></div>

                <div class="px-3 mb-2">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">${t('nav.creative_studio')}</span>
                </div>

                ${renderNavButton('timeline', '📚', t('nav.library'))}
                ${renderNavButton('media', '📁', t('nav.media'))}
                ${renderNavButton('editor', '✨', t('nav.editor'))}
            </div>

            <div class="flex-shrink-0 p-4 border-t border-slate-100 bg-white">
                 ${user.email === 'profesor@profesor.cz' ? `
                <button data-view="admin" class="nav-item w-full flex items-center p-2.5 rounded-xl transition-all duration-200 text-slate-500 hover:bg-yellow-50 hover:text-yellow-700 group mb-1">
                    <span class="text-xl mr-3 group-hover:rotate-90 transition-transform duration-500">⚙️</span>
                    <span class="text-sm font-medium">${t('nav.admin')}</span>
                </button>
                ` : ''}
            </div>
        `;

        // Helper Function for Consistent Buttons
        function renderNavButton(view, icon, label) {
            return `
            <button data-view="${view}" class="nav-item w-full flex items-center p-2.5 rounded-xl transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group relative overflow-hidden">
                <span class="text-xl mr-3 relative z-10 group-hover:scale-110 transition-transform duration-200">${icon}</span>
                <span class="text-sm font-medium relative z-10">${label}</span>
            </button>`;
        }

        // Event Listeners
        nav.querySelectorAll('button[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                updateActiveState(view);
                showProfessorContent(view);
            });
        });

        // Logo Handler
        const logo = nav.querySelector('#nav-logo');
        if (logo) logo.addEventListener('click', () => {
            updateActiveState('dashboard');
            showProfessorContent('dashboard');
        });
        
        // Initial State
        updateActiveState('dashboard');

        function updateActiveState(activeView) {
            // Reset ALL buttons
            nav.querySelectorAll('.nav-item').forEach(b => {
                b.className = 'nav-item w-full flex items-center p-2.5 rounded-xl transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group';
            });

            // Set Active
            const activeBtn = nav.querySelector(`button[data-view="${activeView}"]`);
            if (activeBtn) {
                // Style: Indigo Background, Indigo Text, Bold (NO BORDERS)
                let activeClass = 'nav-item w-full flex items-center p-2.5 rounded-xl transition-all duration-200 bg-indigo-50 text-indigo-700 font-bold shadow-sm group';
                
                if (activeView === 'admin') {
                     activeClass = 'nav-item w-full flex items-center p-2.5 rounded-xl transition-all duration-200 bg-yellow-50 text-yellow-700 font-bold shadow-sm group';
                }
                
                activeBtn.className = activeClass;
            }
        }
    }
}
