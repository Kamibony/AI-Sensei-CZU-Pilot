// public/js/professor.js

import { handleLogout } from './auth.js';
// ==== OPRAVENÝ IMPORT ====
import { initializeProfessorNavigation } from './views/professor/navigation.js';
// =========================
import { renderTimelineView } from './views/professor/timeline-view.js';
import { renderStudentsView } from './views/professor/students-view.js';
import { renderInteractionsView } from './views/professor/interactions-view.js';

// Importujeme nový komponent LessonEditor
import './professor/lesson-editor.js';

let currentProfessorView = 'timeline'; // Predvolený pohľad
let currentLessonForEditing = null; // Lekcia, ktorá sa práve edituje

export function initProfessorDashboard() {
    const wrapper = document.getElementById('role-content-wrapper');
    if (!wrapper) {
        console.error('Professor dashboard wrapper not found!');
        return;
    }
    
    wrapper.innerHTML = `
        <header class="bg-white shadow-sm p-4 flex justify-between items-center flex-shrink-0">
            <h1 class="text-xl font-bold text-slate-800">AI Sensei - Profesor</h1>
            <button id="professor-logout-btn" class="bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-2 px-4 rounded-lg">Odhlásit se</button>
        </header>
        <div id="professor-main-content" class="flex-grow overflow-y-auto"></div> 
    `;

    document.getElementById('professor-logout-btn').addEventListener('click', handleLogout);
    
    // ==== OPRAVENÉ VOLANIE ====
    initializeProfessorNavigation(switchProfessorView); 
    // ========================

    // Nastavíme počiatočný pohľad
    switchProfessorView(currentProfessorView);

    // Pridáme listenery na udalosti z komponentov
    const mainContentArea = document.getElementById('professor-main-content');
    if (mainContentArea) {
        // Keď timeline-view chce editovať lekciu
        mainContentArea.addEventListener('edit-lesson', (e) => {
            currentLessonForEditing = e.detail.lesson;
            switchProfessorView('editor'); // Prepne na editor
        });
        
        // Keď lesson-editor chce zavrieť
        mainContentArea.addEventListener('editor-closed', () => {
             currentLessonForEditing = null; // Zabudneme lekciu
             switchProfessorView('timeline'); // Vrátime sa na timeline
        });
        
        // Keď lesson-editor uloží lekciu
         mainContentArea.addEventListener('lesson-saved', (e) => {
              // Momentálne len logujeme, ale tu by sa mohla obnoviť časť Timeline
              console.log('Lesson saved in editor:', e.detail.lesson);
              // Ak sme vytvorili novú lekciu a vrátili sa, Timeline ju už načíta sama pri ďalšom renderovaní
         });
    }
}

export function cleanupProfessorDashboard() {
    // Tu by sme mali odstrániť listenery, ak sme nejaké pridali globálne
    currentLessonForEditing = null; // Reset
    console.log("Professor dashboard cleaned up.");
}

function switchProfessorView(viewId) {
    currentProfessorView = viewId;
    const mainContentArea = document.getElementById('professor-main-content');
    if (!mainContentArea) return;

    // Vyčistíme predchádzajúci obsah
    mainContentArea.innerHTML = '<div class="p-8 text-center text-slate-500">Načítání...</div>';
    
    switch (viewId) {
        case 'timeline':
            renderTimelineView(mainContentArea);
            break;
        
        case 'editor':
             mainContentArea.innerHTML = ''; // Vyčistíme "Načítání..."
             const editorElement = document.createElement('lesson-editor');
             // Odovzdáme lekciu (môže byť aj null pre novú lekciu) ako property
             editorElement.lesson = currentLessonForEditing; 
             mainContentArea.appendChild(editorElement);
             break;

        case 'students':
            renderStudentsView(mainContentArea);
            break;
        case 'interactions':
            renderInteractionsView(mainContentArea);
            break;
        default:
            mainContentArea.innerHTML = `<div class="p-8 text-center text-red-500">Neznámý pohled: ${viewId}</div>`;
    }
    console.log(`Switched professor view to: ${viewId}`);
}
