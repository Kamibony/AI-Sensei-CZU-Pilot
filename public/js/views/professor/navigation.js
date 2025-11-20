import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export function setupProfessorNav(showProfessorContent) {
    const nav = document.getElementById('main-nav');
    const auth = getAuth();
    const user = auth.currentUser;

    if (nav && user) {
        // Apply sidebar styling to the container
        nav.className = 'fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 z-50 flex flex-col';

        nav.innerHTML = `
            <div id="nav-logo" class="p-6 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors">
                <h1 class="text-2xl font-bold text-green-700 flex items-center gap-2">
                    <span>🎓</span> AI Sensei
                </h1>
            </div>

            <div class="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                <button data-view="timeline" class="nav-item w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors duration-200 text-slate-600 hover:bg-green-50 hover:text-green-700 text-left group">
                    <span class="text-xl group-hover:scale-110 transition-transform">🗓️</span>
                    <span class="font-medium">Plán výuky</span>
                </button>

                <button data-view="classes" class="nav-item w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors duration-200 text-slate-600 hover:bg-green-50 hover:text-green-700 text-left group">
                    <span class="text-xl group-hover:scale-110 transition-transform">🏫</span>
                    <span class="font-medium">Třídy</span>
                </button>

                <button data-view="students" class="nav-item w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors duration-200 text-slate-600 hover:bg-green-50 hover:text-green-700 text-left group">
                    <span class="text-xl group-hover:scale-110 transition-transform">👥</span>
                    <span class="font-medium">Studenti</span>
                </button>

                <button data-view="interactions" class="nav-item w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors duration-200 text-slate-600 hover:bg-green-50 hover:text-green-700 text-left group">
                    <span class="text-xl group-hover:scale-110 transition-transform">💬</span>
                    <span class="font-medium">Interakce</span>
                </button>

                <button data-view="analytics" class="nav-item w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors duration-200 text-slate-600 hover:bg-green-50 hover:text-green-700 text-left group">
                    <span class="text-xl group-hover:scale-110 transition-transform">📊</span>
                    <span class="font-medium">Analýza</span>
                </button>

                <button data-view="media" class="nav-item w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors duration-200 text-slate-600 hover:bg-green-50 hover:text-green-700 text-left group">
                    <span class="text-xl group-hover:scale-110 transition-transform">📁</span>
                    <span class="font-medium">Knihovna</span>
                </button>
            </div>

            <div class="p-4 border-t border-slate-100">
                 ${user.email === 'profesor@profesor.cz' ? `
                <button data-view="admin" class="nav-item w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors duration-200 text-slate-600 hover:bg-yellow-50 hover:text-yellow-700 text-left mb-2 group">
                    <span class="text-xl group-hover:scale-110 transition-transform">⚙️</span>
                    <span class="font-medium">Admin</span>
                </button>
                ` : ''}

                <button id="logout-btn-nav" class="w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors duration-200 text-slate-600 hover:bg-red-50 hover:text-red-700 text-left group">
                    <span class="text-xl group-hover:scale-110 transition-transform">🚪</span>
                    <span class="font-medium">Odhlásit se</span>
                </button>
            </div>
        `;

        // Setup Click Listeners
        nav.querySelectorAll('button[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                nav.querySelectorAll('button[data-view]').forEach(b => {
                    b.classList.remove('bg-green-50', 'text-green-700', 'bg-yellow-50', 'text-yellow-700');
                    b.classList.add('text-slate-600');
                });

                const activeBg = view === 'admin' ? 'bg-yellow-50' : 'bg-green-50';
                const activeText = view === 'admin' ? 'text-yellow-700' : 'text-green-700';

                e.currentTarget.classList.remove('text-slate-600');
                e.currentTarget.classList.add(activeBg, activeText);

                showProfessorContent(view);
            });
        });

        // Logo Click to Dashboard
        const logo = nav.querySelector('#nav-logo');
        if (logo) {
            logo.addEventListener('click', () => {
                nav.querySelectorAll('button[data-view]').forEach(b => {
                    b.classList.remove('bg-green-50', 'text-green-700', 'bg-yellow-50', 'text-yellow-700');
                    b.classList.add('text-slate-600');
                });
                showProfessorContent('dashboard');
            });
        }

    }
}
