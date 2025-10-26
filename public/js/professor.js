// public/js/professor.js

// Odstránili sme VŠETKY importy okrem jedného, ktorý potrebujeme na spustenie
// Všetky ostatné závislosti sú teraz spravované v 'professor-app.js'
import './views/professor/professor-app.js';

// Všetky globálne premenné (lessonsData, unsubscribes) sú preč.
// Všetky funkcie (fetchLessons, renderLessonLibrary, showProfessorContent, createStatCard) sú preč.
// Sú presunuté do nových komponentov.

/**
 * Inicializuje hlavný komponent profesorského dashboardu.
 * Toto je JEDINÁ funkcia, ktorá zostáva v tomto súbori.
 */
export async function initProfessorDashboard() {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    // Namiesto generovania HTML reťazca, teraz len vložíme náš hlavný komponent.
    // Tento komponent si sám spravuje svoj vnútorný layout a logiku.
    roleContentWrapper.innerHTML = `<professor-app></professor-app>`;
    
    // Všetka ostatná logika (setupProfessorNav, handleLogout, fetchLessons, showProfessorContent)
    // je teraz spravovaná interne komponentom <professor-app>.
}
