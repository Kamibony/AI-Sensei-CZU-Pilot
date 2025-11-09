// public/js/professor.js

import './views/professor/professor-app.js';

/**
 * Inicializuje hlavný komponent profesorského dashboardu.
 * Premenované na initProfessorApp pre kompatibilitu s app.js
 */
export async function initProfessorApp(user) {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    // Vložíme hlavný web komponent, ktorý si už rieši všetko sám
    roleContentWrapper.innerHTML = `<professor-app></professor-app>`;
    
    console.log("Professor app initialized for user:", user.uid);
}
