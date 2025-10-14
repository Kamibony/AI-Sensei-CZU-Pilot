import { handleSignOut as handleLogout } from '../../auth.js';

export function setupProfessorNav(showContentCallback) {
    const nav = document.getElementById('main-nav');
    if(nav) {
        nav.classList.add('hidden', 'md:flex');
        nav.innerHTML = `
            <div class="flex flex-col h-full">
                <div class="flex-grow space-y-4">
                    <li id="nav-timeline"><button class="nav-item p-3 rounded-lg flex items-center justify-center text-white bg-green-700" title="Časová osa"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 6V4c0-1.1-.9-2-2-2h-2"/><path d="M3 18v2c0 1.1.9 2 2 2h2"/><path d="M12 2v20"/><path d="M19 6V4c0-1.1-.9-2-2-2h-2"/><path d="M3 18v2c0 1.1.9 2 2 2h2"/><path d="M12 2v20"/><path d="m3 6 3-3 3 3"/><path d="m15 18 3 3 3-3"/></svg></button></li>
                    <li id="nav-students"><button class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white" title="Studenti"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></button></li>
                    <li id="nav-interactions"><button class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white" title="Interakce"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></button></li>
                    <li id="nav-media"><button class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white" title="Média"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></button></li>
                    <li id="nav-analytics"><button class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white" title="Analýza"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 2.5h3l4 4h11"/><path d="m18 14-4 4-4-4"/><path d="M10 2.5v4"/><path d="M14 14v4.5"/></svg></button></li>
                </div>
                <div>
                    <li><button id="logout-btn-nav" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-red-700 hover:text-white" title="Odhlásit se"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg></button></li>
                </div>
            </div>`;
            
        const navItems = nav.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                navItems.forEach(i => {
                    i.classList.remove('bg-green-700', 'text-white');
                    i.classList.add('text-green-200');
                });
                item.classList.add('bg-green-700', 'text-white');
                item.classList.remove('text-green-200');

                const viewName = item.parentElement.id.split('-')[1];
                showContentCallback(viewName);
            });
        });
        document.getElementById('logout-btn-nav').addEventListener('click', handleLogout);
    }
}

export function showView(view, data) {
    // Táto funkcia bola v staršej verzii, nechávam ju pre kompatibilitu, 
    // hoci sa zdá, že nová logika ju priamo nepoužíva.
    // Ak sa používa, jej telo by malo byť tu.
    console.log(`Showing view: ${view} with data:`, data);
}
