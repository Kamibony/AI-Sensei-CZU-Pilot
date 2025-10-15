import { db } from './firebase-init.js';
// --- TOTO JE OPRAVA ---
// Pridali sme 'query' a 'orderBy' do zoznamu importov
import { collection, getDocs, query, orderBy, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
import { setupNavigation } from './views/professor/navigation.js';
import { renderTimeline } from './views/professor/timeline-view.js';
import { renderStudents } from './views/professor/students-view.js';
import { renderStudentProfile } from './views/professor/student-profile-view.js';
import { renderInteractions } from './views/professor/interactions-view.js';

// Globálna premenná, kde si uložíme načítané lekcie
let allLessons = [];

// Mapa, ktorá priraďuje cesty v URL k funkciám, ktoré ich vykresľujú
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
    },
    '/interactions': (params) => {
        if (params.lessonId) {
            renderInteractions(params.lessonId);
        } else {
            console.error('Chýba ID lekcie pre zobrazenie interakcií.');
        }
    }
};

// Funkcia, ktorá spracuje zmenu URL (časť za #)
export function handleRouteChange() {
    console.log("Spúšťam handleRouteChange...");
    const path = window.location.hash.substring(1) || '/';
    const [routePath, queryString] = path.split('?');
    
    const renderFunction = routes[routePath] || routes['/'];

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
    
    const mainContentTemplate = document.getElementById('professor-dashboard-template');
    if (!mainContentTemplate) {
        console.error("CHYBA: Šablóna 'professor-dashboard-template' nebola nájdená!");
        return;
    }
    roleContentWrapper.innerHTML = '';
    roleContentWrapper.appendChild(mainContentTemplate.content.cloneNode(true));
    
    // 1. Načítame lekcie
    try {
        const q = query(collection(db, "lessons"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        allLessons = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching lessons: ", error);
        showToast("Nepodařilo se načíst lekce.", true);
        // V prípade chyby pokračujeme s prázdnym poľom, aby sa aplikácia nezrútila
        allLessons = [];
    }

    // 2. Nastavíme navigáciu
    setupNavigation();

    // 3. Zobrazíme predvolenú stránku
    handleRouteChange(); 

    // 4. Sledujeme zmeny v URL
    window.addEventListener('hashchange', handleRouteChange);
    
    console.log("initProfessorDashboard dokončený.");
}
