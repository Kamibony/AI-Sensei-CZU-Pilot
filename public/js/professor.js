import { setupNavigation } from './views/professor/navigation.js';
import { renderTimeline } from './views/professor/timeline-view.js';
import { renderStudents } from './views/professor/students-view.js';
import { renderStudentProfile } from './views/professor/student-profile-view.js';
import { db } from './firebase-init.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';

// Globálna premenná pre lekcie, aby sme ich nemuseli stále načítavať
let allLessons = [];

// Mapa, ktorá priraďuje cesty v URL k funkciám, ktoré majú zobraziť obsah
const routes = {
    '/': () => renderTimeline(allLessons),
    '/timeline': () => renderTimeline(allLessons),
    '/students': renderStudents,
    '/student-profile': (params) => {
        if (params.id) {
            renderStudentProfile(params.id);
        } else {
            console.error('Chýba ID študenta pre zobrazenie profilu.');
        }
    }
};

// Funkcia, ktorá spracuje zmenu URL (časť za #)
export function handleRouteChange() {
    const path = window.location.hash.substring(1) || '/';
    const [routePath, queryString] = path.split('?');
    
    const renderFunction = routes[routePath];

    if (renderFunction) {
        const params = new URLSearchParams(queryString);
        const paramsObject = Object.fromEntries(params.entries());
        renderFunction(paramsObject);
    } else {
        console.error(`Cesta '${routePath}' nebola nájdená.`);
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
            mainContent.innerHTML = '<h2>404 - Stránka nenalezena</h2>';
        }
    }
}

// Hlavná inicializačná funkcia pre profesorský panel
export async function initProfessorDashboard() {
    console.log("Spúšťam initProfessorDashboard...");

    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) {
        console.error("CHYBA: Element 'role-content-wrapper' nebol nájdený!");
        return;
    }
    
    // Vytvoríme hlavný obsahový kontajner, do ktorého budú všetky zobrazenia vkladať obsah
    roleContentWrapper.innerHTML = `
        <div class="flex-grow p-4 md:p-6 lg:p-8 overflow-y-auto">
            <div id="main-content">
                <h2>Načítání...</h2>
            </div>
        </div>
    `;

    // Načítame lekcie iba raz pri inicializácii
    try {
        const querySnapshot = await getDocs(collection(db, "lessons"));
        allLessons = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching lessons: ", error);
        showToast("Nepodařilo se načíst lekce.", true);
    }

    // Nastavíme navigáciu
    setupNavigation(allLessons);

    // Prvé spracovanie cesty po načítaní
    handleRouteChange(); 

    // Sledujeme zmeny v URL (napr. pri kliknutí na tlačidlá späť/vpred)
    window.addEventListener('hashchange', handleRouteChange);
    
    console.log("initProfessorDashboard dokončený.");
}
