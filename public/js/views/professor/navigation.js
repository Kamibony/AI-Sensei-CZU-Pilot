// public/js/views/professor/navigation.js

// ==== ZMENA: Pridané 'export' priamo k definícii funkcie ====
export function initializeProfessorNavigation(viewSwitcher) {
// ==========================================================
    const mainNav = document.getElementById('main-nav');
    const mobileNav = document.getElementById('mobile-bottom-nav');

    const navItems = [
        { id: 'timeline', label: 'Plán výuky', icon: '📅' },
        { id: 'students', label: 'Studenti', icon: '👥' },
        { id: 'interactions', label: 'Interakce', icon: '💬' },
        // { id: 'settings', label: 'Nastavení', icon: '⚙️' } // Príklad ďalšej položky
    ];

    function renderNav(container, isMobile) {
        container.innerHTML = ''; // Vyčistiť existujúci obsah
        navItems.forEach(item => {
            const button = document.createElement('button');
            button.dataset.viewId = item.id;
            button.className = `nav-item flex items-center justify-center p-3 rounded-lg transition-colors w-full ${isMobile ? 'flex-col text-xs' : 'mb-2'}`;
            button.innerHTML = `
                <span class="text-xl ${isMobile ? 'mb-1' : 'mr-3'}">${item.icon}</span>
                <span class="${isMobile ? '' : 'hidden md:inline'}">${item.label}</span>
            `;
            button.addEventListener('click', () => {
                viewSwitcher(item.id);
                updateActiveState(item.id);
            });
            container.appendChild(button);
        });
        updateActiveState('timeline'); // Nastaviť východziu aktívnu položku
    }

    function updateActiveState(activeViewId) {
        document.querySelectorAll('.nav-item').forEach(button => {
            if (button.dataset.viewId === activeViewId) {
                // Štýly pre aktívnu položku
                button.classList.add('bg-green-700', 'text-white');
                button.classList.remove('text-green-100', 'hover:bg-green-700', 'hover:text-white'); // Odstrániť hover štýly
            } else {
                // Štýly pre neaktívnu položku
                button.classList.remove('bg-green-700', 'text-white');
                button.classList.add('text-green-100', 'hover:bg-green-700', 'hover:text-white'); // Pridať späť hover štýly
            }
        });
    }

    if (mainNav) {
        mainNav.classList.remove('hidden'); // Zobrazíme desktopovú navigáciu
        renderNav(mainNav, false);
    }
    if (mobileNav) {
        renderNav(mobileNav, true);
    }
}

// ==== ZMENA: Odstránený export na konci súboru ====
// export { initializeProfessorNavigation };
// =================================================
