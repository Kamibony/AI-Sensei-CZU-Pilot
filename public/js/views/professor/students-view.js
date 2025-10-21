// Súbor: public/js/views/professor/students-view.js
// Verzia: Upravená pre priraďovanie študentov

import { 
    collection, 
    query, 
    orderBy, 
    onSnapshot, 
    where,
    getDocs, // <-- ZMENA 1: Pridaný import
    doc, // <-- ZMENA 2: Pridaný import
    updateDoc // <-- ZMENA 3: Pridaný import
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"; 
import { showToast } from '../../utils.js'; // <-- ZMENA 4: Pridaný import

/**
 * Vykreslí pohled pro seznam studentů.
 * @param {HTMLElement} container - Kontejner, kam se má obsah vykreslit.
 * @param {object} db - Instance Firestore databáze.
 * @param {function} unsubscribe - Funkce pro odhlášení předchozího listeneru.
 * @param {function} navigateToStudentProfile - Callback pro navigaci na profil studenta.
 * @param {string} professorId - ID přihlášeného profesora pro filtrování.
 */
export function renderStudentsView(container, db, unsubscribe, navigateToStudentProfile, professorId) { // Parameter 'professorId' už bol pridaný
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
                        + Přidat studenta
                    </button>
                </div>
                <div id="students-list-container" class="overflow-x-auto">
                    <p class="text-slate-500">Načítám studenty...</p>
                </div>
            </div>
        </div>
        
        <div id="add-student-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 hidden z-50">
            <div class="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md">
                <h2 class="text-xl font-bold text-slate-800 mb-4">Přidat existujícího studenta</h2>
                <p class="text-sm text-slate-600 mb-4">Zadejte email studenta, kterého chcete přiřadit ke svému účtu. Student musí již mít účet v AI Sensei a nesmí být přiřazen k jinému profesorovi.</p>
                <div>
                    <label for="student-email-input" class="block text-sm font-medium text-slate-700 mb-1">Email studenta</label>
                    <input type="email" id="student-email-input" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="student@email.com">
                </div>
                <div class="flex justify-end gap-3 mt-6">
                    <button id="cancel-add-student-btn" class="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-200">Zrušit</button>
                    <button id="confirm-add-student-btn" class="px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 flex items-center justify-center min-w-[100px]">Přidat</button>
                </div>
            </div>
        </div>
    `;

    const listContainer = document.getElementById('students-list-container');
    const studentsCollection = collection(db, 'students');

    // Dopyt na zoznam študentov (bez zmeny)
    const q = query(
        studentsCollection, 
        where("professorId", "==", professorId), 
        orderBy("createdAt", "desc")
    );

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
                        const progress = 0; // Placeholder

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

    // --- ZMENA 6: Logika pre modálne okno ---
    
    const modal = document.getElementById('add-student-modal');
    const addStudentBtn = document.getElementById('add-student-btn');
    const cancelBtn = document.getElementById('cancel-add-student-btn');
    const confirmBtn = document.getElementById('confirm-add-student-btn');
    const emailInput = document.getElementById('student-email-input');

    const showModal = () => modal.classList.remove('hidden');
    const hideModal = () => modal.classList.add('hidden');

    addStudentBtn.addEventListener('click', showModal);
    cancelBtn.addEventListener('click', hideModal);

    confirmBtn.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        if (!email) {
            showToast("Zadejte prosím email.", true);
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<div class="spinner-small"></div>';

        try {
            // 1. Nájsť študenta podľa emailu
            const qStudent = query(
                collection(db, 'students'), 
                where("email", "==", email)
            );
            const studentSnapshot = await getDocs(qStudent);

            if (studentSnapshot.empty) {
                showToast("Student s tímto emailem nebyl nalezen.", true);
                return;
            }

            const studentDoc = studentSnapshot.docs[0]; // Predpokladáme, že email je unikátny
            const studentData = studentDoc.data();

            // 2. Skontrolovať, či už nie je priradený
            if (studentData.professorId) {
                if (studentData.professorId === professorId) {
                    showToast("Tento student je již ve vaší třídě.", false);
                } else {
                    showToast("Student je již přiřazen k jinému profesorovi.", true);
                }
                return;
            }

            // 3. Priradiť študenta (update poľa professorId)
            // Toto by malo byť povolené na základe firestore.rules [riadky 46-48]
            await updateDoc(doc(db, 'students', studentDoc.id), {
                professorId: professorId
            });

            showToast("Student byl úspěšně přidán do vaší třídy.", false);
            emailInput.value = '';
            hideModal();

        } catch (error) {
            console.error("Chyba při přiřazování studenta: ", error);
            if (error.code === 'permission-denied') {
                 showToast("Chyba oprávnění: Ujistěte se, že student není již přiřazen.", true);
            } else {
                 showToast("Při přiřazování studenta došlo k chybě.", true);
            }
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = 'Přidat';
        }
    });
    
    return unsubscribe;
}
