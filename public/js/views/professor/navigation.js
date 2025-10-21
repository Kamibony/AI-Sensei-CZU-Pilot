// Súbor: public/js/views/professor/navigation.js
// Verzia: Plná, rešpektujúca pôvodnú štruktúru + Admin tlačidlo

/**
 * Nastaví navigační menu pro profesora.
 * @param {function} switchViewCallback Funkce pro přepnutí pohledu.
 * @param {string} userEmail Email přihlášeného uživatele (pro admin check).
 */
export function setupProfessorNav(switchViewCallback, userEmail) { // <-- ZMENA 1: Pridaný userEmail
    const navContainer = document.getElementById('professor-navigation');
    const mobileNavContainer = document.getElementById('mobile-bottom-nav');
    const logoutBtn = document.getElementById('logout-btn-nav');

    if (!navContainer || !mobileNavContainer || !logoutBtn) {
        console.warn("Chybí navigační elementy v DOM.");
        return;
    }

    const navItems = [
        { id: 'nav-timeline', icon: '📅', text: 'Timeline', view: 'timeline' },
        { id: 'nav-students', icon: '👥', text: 'Studenti', view: 'students' },
        { id: 'nav-media', icon: '🖼️', text: 'Média', view: 'media' },
        { id: 'nav-interactions', icon: '💬', text: 'Interakce', view: 'interactions' },
        { id: 'nav-analytics', icon: '📊', text: 'Analýza', view: 'analytics' }
    ];

    // --- ZMENA 2: Podmienené pridanie Admin tlačidla ---
    if (userEmail === "profesor@profesor.cz") {
        navItems.push({ id: 'nav-admin', icon: '🔑', text: 'Admin', view: 'admin' });
    }
    // ----------------------------------------------

    const navItemsHtml = navItems.map(item => `
        <button id="${item.id}" data-view="${item.view}" class="nav-button w-full flex flex-col items-center p-3 text-slate-300 hover:bg-green-700 hover:text-white transition-colors rounded-lg">
            <span class="text-2xl">${item.icon}</span>
            <span class="text-xs font-medium mt-1">${item.text}</span>
        </button>
    `).join('');

    const mobileNavItemsHtml = navItems.map(item => `
        <button id="mobile-${item.id}" data-view="${item.view}" class="nav-button-mobile flex-1 flex flex-col items-center p-2 text-slate-600">
            <span class="text-xl">${item.icon}</span>
            <span class="text-xs">${item.text}</span>
        </button>
    `).join('');

    navContainer.innerHTML = navItemsHtml;
    mobileNavContainer.innerHTML = mobileNavItemsHtml;

    // Pridanie listenerov
    document.querySelectorAll('.nav-button, .nav-button-mobile').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.currentTarget.dataset.view;
            if (view) {
                switchViewCallback(view);
                
                // Zvýraznenie aktívneho tlačidla
                document.querySelectorAll('.nav-button, .nav-button-mobile').forEach(b => b.classList.remove('bg-green-700', 'text-white', 'text-green-700')); // Pridané text-green-700 pre mobil
                
                // Desktop - Pôvodná logika z tvojho súboru
                const desktopBtnId = btn.id.replace('mobile-', '');
                document.getElementById(desktopBtnId)?.classList.add('bg-green-700', 'text-white');
                
                // Mobile - Pôvodná logika z tvojho súboru
                const mobileBtnId = btn.id.startsWith('mobile-') ? btn.id : `mobile-${btn.id}`;
                document.getElementById(mobileBtnId)?.classList.add('text-green-700'); // Tu by si možno chcel inú triedu
            }
        });
    });
}
