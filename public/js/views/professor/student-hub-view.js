import { collection, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "../../firebase-init.js";
import { showToast } from "../../utils.js";

export function renderStudentHub(container, onStudentClick) {
    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white">
            <h1 class="text-3xl font-extrabold text-slate-800">Přehled Studentů</h1>
        </header>
        <div id="student-list-container" class="flex-grow overflow-y-auto p-4 md:p-6">
            <p class="text-center text-slate-500">Načítám studenty...</p>
        </div>
    `;

    const studentsCollection = collection(db, 'students');
    const q = query(studentsCollection, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const students = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const studentListContainer = document.getElementById('student-list-container');

        if (!studentListContainer) return;

        if (students.length === 0) {
            studentListContainer.innerHTML = '<p class="text-center text-slate-500 p-8">Zatím se nezaregistrovali žádní studenti.</p>';
            return;
        }

        const studentsHtml = students.map(student => `
            <div class="student-list-item p-4 bg-white border rounded-lg cursor-pointer hover:shadow-md flex justify-between items-center mb-4" data-student-id="${student.id}">
                <div>
                    <h3 class="font-semibold text-slate-800">${student.name || 'Jméno neuvedeno'}</h3>
                    <p class="text-sm text-slate-500">${student.email}</p>
                </div>
            </div>
        `).join('');
        
        studentListContainer.innerHTML = `<div class="space-y-4">${studentsHtml}</div>`;

        studentListContainer.querySelectorAll('.student-list-item').forEach(item => {
            item.addEventListener('click', () => {
                onStudentClick(item.dataset.studentId);
            });
        });

    }, (error) => {
        console.error("Error fetching students in real-time:", error);
        showToast("Nepodařilo se načíst seznam studentů.", true);
        const studentListContainer = document.getElementById('student-list-container');
        if (studentListContainer) {
            studentListContainer.innerHTML = '<p class="text-center text-red-500 p-8">Chyba při načítání studentů.</p>';
        }
    });

    return unsubscribe;
}
