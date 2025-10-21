// Súbor: public/js/views/professor/students-view.js
// Verzia: Plná, rešpektujúca pôvodnú štruktúru + Filtrovanie podľa professorId

import { collection, query, orderBy, onSnapshot, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"; // <-- ZMENA 1: Pridané 'where'

/**
 * Vykreslí pohled pro seznam studentů.
 * @param {HTMLElement} container - Kontejner, kam se má obsah vykreslit.
 * @param {object} db - Instance Firestore databáze.
 * @param {function} unsubscribe - Funkce pro odhlášení předchozího listeneru.
 * @param {function} navigateToStudentProfile - Callback pro navigaci na profil studenta.
 * @param {string} professorId - ID přihlášeného profesora pro filtrování.
 */
export function renderStudentsView(container, db, unsubscribe, navigateToStudentProfile, professorId) { // <-- ZMENA 2: Pridaný parameter 'professorId'
    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white">
            <h1 class="text-3xl font-extrabold text-slate-800">Seznam studentů</h1>
            <p class="text-slate-500 mt-1">Spravujte své studenty a sledujte jejich pokrok.</p>
        </header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6">
            <div class="bg-white p-6 rounded-2xl shadow-lg">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold text-slate-700">Vaši studenti</h2>
                    <button id="add-student-btn" class="px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800">
                        + Pozvat studenta
                    </button>
                </div>
                <div id="students-list-container" class="overflow-x-auto">
                    <p class="text-slate-500">Načítám studenty...</p>
                </div>
            </div>
        </div>
    `;

    const listContainer = document.getElementById('students-list-container');
    const studentsCollection = collection(db, 'students');

    // --- ZMENA 3: Pridané filtrovanie 'where' do dopytu ---
    const q = query(
        studentsCollection, 
        where("professorId", "==", professorId), // Zobrazí iba študentov priradených k tomuto profesorovi
        orderBy("createdAt", "desc")
    );
    // --------------------------------------------------

    unsubscribe = onSnapshot(q, (querySnapshot) => {
        if (querySnapshot.empty) {
            listContainer.innerHTML = '<p class="text-slate-500 py-4 text-center">Zatím nemáte přiřazené žádné studenty.</p>';
            return;
        }

        const tableHtml = `
            <table class="w-full min-w-[600px]">
                <thead>
                    <tr class="border-b border-slate-200">
                        <th class="p-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Jméno</th>
                        <th class="p-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                        <th class="p-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Datum registrace</th>
                        <th class="p-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Pokrok</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    ${querySnapshot.docs.map(doc => {
                        const student = doc.data();
                        const name = student.name || '<i>(neuvedeno)</i>';
                        const email = student.email;
                        const createdAt = student.createdAt?.toDate().toLocaleDateString() || 'Neznámo';
                        // TODO: Implementovat logiku pokroku
                        const progress = 0; 

                        return `
                            <tr class="hover:bg-slate-50 cursor-pointer student-row" data-id="${doc.id}">
                                <td class="p-3 whitespace-nowrap">
                                    <span class="font-medium text-slate-800">${name}</span>
                                </td>
                                <td class="p-3 whitespace-nowrap text-sm text-slate-600">${email}</td>
                                <td class="p-3 whitespace-nowrap text-sm text-slate-600">${createdAt}</td>
                                <td class="p-3 whitespace-nowrap text-sm text-slate-600">
                                    <div class="w-24 bg-slate-200 rounded-full h-2">
                                        <div class="bg-green-600 h-2 rounded-full" style="width: ${progress}%"></div>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
        listContainer.innerHTML = tableHtml;

        // Přidání event listenerů na řádky
        listContainer.querySelectorAll('.student-row').forEach(row => {
            row.addEventListener('click', () => {
                const studentId = row.dataset.id;
                navigateToStudentProfile(studentId);
            });
        });

    }, (error) => {
        console.error("Error fetching students: ", error);
        listContainer.innerHTML = '<p class="text-red-500 py-4 text-center">Při načítání studentů došlo k chybě.</p>';
    });

    // TODO: Implementovat logiku pro 'add-student-btn'
    // (napr. modal na pridanie emailu študenta, ktorý mu nastaví 'professorId' v databáze)
    document.getElementById('add-student-btn').addEventListener('click', () => {
        alert("Funkce pro pozvání studenta se připravuje.\nProzatím je nutné studentovi nastavit 'professorId' ručně v databázi.");
    });


    return unsubscribe;
}
