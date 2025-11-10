export function setupProfessorNav(showProfessorContent) {
    const nav = document.getElementById('main-nav');
    if (nav) {
        // === ZAČIATOK ÚPRAVY HTML ===
        nav.innerHTML = `
            <div class="flex flex-col h-full">
                <div class="flex-grow space-y-4">
                    
                    <li>
                        <button data-view="timeline" class="nav-item w-full p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white group bg-green-700 text-white" title="Plán výuky">
                            <div class="h-10 w-10 rounded-md flex items-center justify-center bg-green-600 group-hover:bg-green-500 transition-colors duration-200">
                                <span class="text-2xl">🗓️</span>
                            </div>
                        </button>
                    </li>

                    <li>
                        <button data-view="classes" class="nav-item w-full p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white group" title="Třídy">
                            <div class="h-10 w-10 rounded-md flex items-center justify-center bg-green-900 group-hover:bg-green-600 transition-colors duration-200">
                                <span class="text-2xl">🏫</span>
                            </div>
                        </button>
                    </li>
                    
                    <li>
                        <button data-view="students" class="nav-item w-full p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white group" title="Studenti">
                            <div class="h-10 w-10 rounded-md flex items-center justify-center bg-green-900 group-hover:bg-green-600 transition-colors duration-200">
                                <span class="text-2xl">👥</span>
                            </div>
                        </button>
                    </li>

                    <li>
                        <button data-view="interactions" class="nav-item w-full p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white group" title="Interakce">
                             <div class="h-10 w-10 rounded-md flex items-center justify-center bg-green-900 group-hover:bg-green-600 transition-colors duration-200">
                                <span class="text-2xl">💬</span>
                            </div>
                        </button>
                    </li>

                    <li>
                        <button data-view="analytics" class="nav-item w-full p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white group" title="Analýza kurzu">
                            <div class="h-10 w-10 rounded-md flex items-center justify-center bg-green-900 group-hover:bg-green-600 transition-colors duration-200">
                                <span class="text-2xl">📊</span>
                            </div>
                        </button>
                    </li>

                    <li>
                        <button data-view="media" class="nav-item w-full p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white group" title="Knihovna médií">
                            <div class="h-10 w-10 rounded-md flex items-center justify-center bg-green-900 group-hover:bg-green-600 transition-colors duration-200">
                                <span class="text-2xl">📁</span>
                            </div>
                        </button>
                    </li>

                </div>
                
                <!-- === OPRAVA KOMENTÁRA === -->
                <div class="mt-auto"> <!-- Posunie logout na spodok -->
                    <li>
                        <button id="logout-btn-nav" class="nav-item w-full p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-red-700 hover:text-white group" title="Odhlásit se">
                            <div class="h-10 w-10 rounded-md flex items-center justify-center bg-green-900 group-hover:bg-red-600 transition-colors duration-200">
                                <span class="text-2xl">🚪</span>
                            </div>
                        </button>
                    </li>
                </div>
                <!-- === KONIEC OPRAVY === -->
            </div>
        `;
        // === KONIEC ÚPRAVY HTML ===

        nav.querySelectorAll('button[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                nav.querySelectorAll('button[data-view]').forEach(b => {
                    b.classList.remove('bg-green-700', 'text-white');
                    b.classList.add('text-green-200');
                    // Zmena pozadia štvorca ikony
                    b.querySelector('div').classList.remove('bg-green-600');
                    b.querySelector('div').classList.add('bg-green-900');
                });
                e.currentTarget.classList.add('bg-green-700', 'text-white');
                 // Zmena pozadia štvorca ikony pre aktívnu položku
                e.currentTarget.querySelector('div').classList.remove('bg-green-900');
                e.currentTarget.querySelector('div').classList.add('bg-green-600');
                showProfessorContent(view);
            });
        });

        // Správne nastavenie hover efektu pre logout
         const logoutBtn = nav.querySelector('#logout-btn-nav');
         if (logoutBtn) {
             const iconDiv = logoutBtn.querySelector('div');
             logoutBtn.addEventListener('mouseenter', () => iconDiv.classList.replace('bg-green-900', 'bg-red-600'));
             logoutBtn.addEventListener('mouseleave', () => iconDiv.classList.replace('bg-red-600', 'bg-green-900'));
         }

    }
}

