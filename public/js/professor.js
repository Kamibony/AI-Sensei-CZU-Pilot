import { db } from './firebase-init.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
import { setupNavigation } from './views/professor/navigation.js';
import { renderTimeline } from './views/professor/timeline-view.js';
import { renderStudents } from './views/professor/students-view.js';
import { renderStudentProfile } from './views/professor/student-profile-view.js';

// Mapa, ktorá priraďuje cesty v URL k funkciám, ktoré ich vykresľujú
const routes = {
    '/': renderTimeline,
    '/timeline': renderTimeline,
    '/students': renderStudents,
    '/student-profile': (params) => {
        if (params.id) {
            renderStudentProfile(params.id);
        } else {
            console.error('Chýba ID študenta pre zobrazenie profilu.');
            const mainContent = document.getElementById('main-content');
            mainContent.innerHTML = '<h2>Chyba: Chýba ID študenta.</h2>';
        }
    }
};

// Funkcia, ktorá spracuje zmenu URL (časť za #)
export function handleRouteChange() {
    const path = window.location.hash.substring(1) || '/';
    const [routePath, queryString] = path.split('?');
    
    const renderFunction = routes[routePath] || routes['/']; // Ak cesta neexistuje, zobrazí sa default

    const params = new URLSearchParams(queryString);
    const paramsObject = Object.fromEntries(params.entries());
    renderFunction(paramsObject);
}

// Hlavná inicializačná funkcia pre profesorský panel
export async function initProfessorDashboard() {
    console.log("Spúšťam initProfessorDashboard...");

    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) {
        console.error("CHYBA: Element 'role-content-wrapper' nebol nájdený!");
        return;
    }
    
    // NAJPRV VLOŽÍME HTML
    const mainContentTemplate = document.getElementById('professor-dashboard-template');
    if (!mainContentTemplate) {
        console.error("CHYBA: Šablóna 'professor-dashboard-template' nebola nájdená!");
        return;
    }
    roleContentWrapper.appendChild(mainContentTemplate.content.cloneNode(true));
    
    // AŽ POTOM NASTAVÍME NAVIGÁCIU
    setupNavigation();

    // Prvé spracovanie cesty po načítaní stránky
    handleRouteChange(); 

    // Sledujeme zmeny v URL (napr. pri kliknutí na tlačidlá späť/vpred)
    window.addEventListener('hashchange', handleRouteChange);
    
    console.log("initProfessorDashboard dokončený.");
}
