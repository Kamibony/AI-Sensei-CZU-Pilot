import './views/professor/professor-app.js';

/**
 * Inicializuje hlavný komponent profesorského dashboardu.
 */
export async function initProfessorApp(user) {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    roleContentWrapper.innerHTML = `<professor-app></professor-app>`;
    
    console.log("Professor app initialized for user:", user.uid);
}
