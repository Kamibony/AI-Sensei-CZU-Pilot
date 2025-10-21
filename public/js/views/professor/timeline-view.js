// Súbor: public/js/views/professor/timeline-view.js
// Verzia: Plná, rešpektujúca pôvodnú štruktúru + Multi-Profesor

import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"; // <-- ZMENA 1: Pridaný import

/**
 * Vykreslí pohled pro timeline (sekvenci lekcí).
 * @param {HTMLElement} container - Kontejner, kam se má obsah vykreslit.
 * @param {object} db - Instance Firestore databáze.
 * @param {Array} lessonsData - Pole s načtenými lekcemi.
 * @param {string} professorId - ID přihlášeného profesora.
 */
export async function renderTimeline(container, db, lessonsData, professorId) { // <-- ZMENA 2: Pridaný 'professorId'
    
    // Seřadíme lekce podle timelinePosition (pokud existuje), jinak podle createdAt
    const sortedLessons = lessonsData
        .filter(lesson => lesson.timelinePosition !== undefined && lesson.timelinePosition !== null)
        .sort((a, b) => a.timelinePosition - b.timelinePosition);

    // TODO: Co s lekcemi, které nemají timelinePosition? Měly by se zobrazit?
    // Prozatím zobrazíme jen ty, které jsou v timeline.

    const timelineHtml = sortedLessons.map((lesson, index) => `
        <div class="timeline-item-wrapper p-1" data-lesson-id="${lesson.id}" data-index="${index}">
            <div class="timeline-item p-4 bg-white border rounded-lg shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md flex justify-between items-center">
                <div>
                    <h3 class="font-semibold text-slate-800">${lesson.title}</h3>
                    <p class="text-sm text-slate-500">${lesson.subtitle || 'Základní lekce'}</p>
                </div>
                <div class="flex items-center space-x-2">
                    <span class="text-xs text-slate-400 font-medium">KROK ${index + 1}</span>
                    <svg class="w-5 h-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="15" x2="10" y2="3"></line><line x1="14" y1="15" x2="14" y2="3"></line><line x1="18" y1="9" x2="6" y2="9"></line><line x1="18" y1="15" x2="6" y2="15"></line><line x1="4" y1="21" x2="20" y2="21"></line></svg>
                </div>
            </div>
        </div>
    `).join('');

    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white">
            <h1 class="text-3xl font-extrabold text-slate-800">Editor Timeline</h1>
            <p class="text-slate-500 mt-1">Sestavte pořadí lekcí přetažením z knihovny vlevo.</p>
        </header>
        <div id="timeline-drop-area" class="flex-grow overflow-y-auto p-4 md:p-6 space-y-2">
            ${timelineHtml || '<div id="timeline-placeholder" class="text-center text-slate-500 p-10 border-2 border-dashed border-slate-300 rounded-lg">Přetáhněte lekce z knihovny sem a sestavte tak timeline kurzu.</div>'}
        </div>
    `;

    const dropArea = document.getElementById('timeline-drop-area');

    if (dropArea && typeof Sortable !== 'undefined') {
        new Sortable(dropArea, {
            group: 'lessons',
            animation: 150,
            ghostClass: 'sortable-ghost',
            onAdd: async (evt) => {
                // Přidání nové lekce do timeline
                const lessonId = evt.item.dataset.lessonId;
                const newIndex = evt.newIndex;
                
                // Aktualizujeme placeholder, pokud je to první položka
                const placeholder = document.getElementById('timeline-placeholder');
                if (placeholder) placeholder.style.display = 'none';

                // Uložíme pozici do DB
                // --- ZMENA 3: Úprava cesty k dokumentu ---
                if (!professorId) {
                    console.error("Critical: professorId is missing in timeline view.");
                    alert("Došlo k chybě, nelze uložit pořadí. Chybí ID profesora.");
                    return;
                }
                const lessonRef = doc(db, 'professors', professorId, 'lessons', lessonId);
                // ----------------------------------------
                
                try {
                    await updateDoc(lessonRef, { timelinePosition: newIndex });
                    // Aktualizujeme i ostatní položky
                    updateLessonOrder(dropArea, professorId, db);
                } catch (error) {
                    console.error("Error updating timeline position (onAdd):", error);
                }
            },
            onEnd: (evt) => {
                // Změna pořadí existujících lekcí v timeline
                if (evt.from !== evt.to || evt.oldIndex === evt.newIndex) return;
                
                // Aktualizujeme pozice v DB
                updateLessonOrder(dropArea, professorId, db);
            }
        });
    }
}

/**
 * Aktualizuje pořadí (timelinePosition) všech lekcí v timeline.
 * @param {HTMLElement} dropArea - Kontejner s timeline lekcemi.
 * @param {string} professorId - ID přihlášeného profesora.
 * @param {object} db - Instance Firestore databáze.
 */
async function updateLessonOrder(dropArea, professorId, db) {
    const items = dropArea.querySelectorAll('.timeline-item-wrapper');
    const promises = [];

    items.forEach((item, index) => {
        item.dataset.index = index; // Aktualizujeme index v DOM
        // Aktualizujeme text "KROK X"
        const stepText = item.querySelector('.text-xs');
        if (stepText) stepText.textContent = `KROK ${index + 1}`;

        const lessonId = item.dataset.lessonId;
        
        // --- ZMENA 4: Úprava cesty k dokumentu ---
        const lessonRef = doc(db, 'professors', professorId, 'lessons', lessonId);
        // ----------------------------------------

        promises.push(updateDoc(lessonRef, { timelinePosition: index }));
    });

    try {
        await Promise.all(promises);
        // showToast("Pořadí lekcí aktualizováno.", false); // Možná příliš časté
    } catch (error) {
        console.error("Error updating full timeline order:", error);
        // showToast("Chyba při ukládání pořadí lekcí.", true);
    }
}
