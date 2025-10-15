import { setupNavigation } from './views/professor/navigation.js';
import { showDashboard } from './views/professor/dashboard-view.js';
import { showStudents } from './views/professor/students-view.js';
import { showStudentProfile } from './views/professor/student-profile-view.js';
import { showTimeline } from './views/professor/timeline-view.js';

// Mapa, ktorá priraďuje cesty k funkciám, ktoré majú byť zavolané
const routes = {
    '/': showDashboard,
    '/students': showStudents,
    '/student-profile': showStudentProfile,
    '/timeline': showTimeline
};

// Funkcia na spracovanie zmeny URL
export function handleRouteChange() {
    // Získanie cesty z URL (časť za #)
    const path = window.location.hash.substring(1) || '/';
    // Rozdelenie cesty a query parametrov
    const [routePath, queryString] = path.split('?');
    
    // Nájdenie správnej funkcie pre danú cestu
    const renderFunction = routes[routePath];

    if (renderFunction) {
        // Vytvorenie objektu z query parametrov
        const params = new URLSearchParams(queryString);
        const paramsObject = Object.fromEntries(params.entries());
        
        // Zavolanie funkcie s parametrami
        renderFunction(paramsObject);
    } else {
        // Ak cesta neexistuje, zobrazí sa chybová správa
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = '<h2>404 - Stránka nenalezena</h2>';
        }
    }
}

// Hlavná inicializačná funkcia pre profesorský panel
export async function initProfessorDashboard() {
    console.log("Spúšťam initProfessorDashboard..."); // DIAGNOSTIKA

    // --- OPRAVENÁ ČASŤ ---
    // Získame hlavný kontajner pre obsah roly
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) {
        console.error("CHYBA: Element 'role-content-wrapper' nebol nájdený!");
        return;
    }
    
    // Vložíme základnú štruktúru pre obsah a v nej vytvoríme 'main-content'
    roleContentWrapper.innerHTML = `
        <div class="flex-grow p-4 md:p-6 lg:p-8 overflow-y-auto">
            <div id="main-content">
                <h2>Načítání...</h2>
            </div>
        </div>
    `;
    // --- KONIEC OPRAVENEJ ČASTI ---

    // Nastavenie navigácie
    setupNavigation();

    // Počiatočné spracovanie cesty
    handleRouteChange(); 

    // Sledovanie zmien v URL (kliknutie na tlačidlá späť/vpred v prehliadači)
    window.addEventListener('hashchange', handleRouteChange);
    
    console.log("initProfessorDashboard dokončený."); // DIAGNOSTIKA
}
