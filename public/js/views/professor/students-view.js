import { db } from '../../firebase-init.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from '../../utils.js';
import { renderStudentProfile } from './student-profile-view.js';

// PRIDANÝ EXPORT
export async function renderStudents() {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <div class="p-8">
            <h2 class="text-2xl font-bold mb-4">Seznam studentů</h2>
            <div id="students-list-container">Načítání...</div>
        </div>
    `;

    try {
        const container = document.getElementById('students-list-container');
        const querySnapshot = await getDocs(collection(db, "students"));
        
        if (querySnapshot.empty) {
            container.innerHTML = '<p>Nebyly nalezeny žádní studenti.</p>';
            return;
        }

        let tableHtml = `
            <table class="min-w-full bg-white">
                <thead class="bg-gray-100">
                    <tr>
                        <th class="py-2 px-4 text-left">Email</th>
                        <th class="py-2 px-4 text-left">Datum registrace</th>
                    </tr>
                </thead>
                <tbody>
        `;

        querySnapshot.forEach(doc => {
            const student = doc.data();
            const registrationDate = student.createdAt ? new Date(student.createdAt.seconds * 1000).toLocaleDateString() : 'Neznámé datum';
            tableHtml += `
                <tr class="border-b hover:bg-gray-50 cursor-pointer" data-student-id="${doc.id}">
                    <td class="py-2 px-4">${student.email}</td>
                    <td class="py-2 px-4">${registrationDate}</td>
                </tr>
            `;
        });

        tableHtml += '</tbody></table>';
        container.innerHTML = tableHtml;

        container.querySelectorAll('tr[data-student-id]').forEach(row => {
            row.addEventListener('click', () => {
                const studentId = row.getAttribute('data-student-id');
                renderStudentProfile(studentId);
            });
        });

    } catch (error) {
        console.error("Error fetching students: ", error);
        showToast("Nepodařilo se načíst studenty.", true);
        document.getElementById('students-list-container').innerHTML = '<p class="text-red-500">Chyba při načítání studentů.</p>';
    }
}
