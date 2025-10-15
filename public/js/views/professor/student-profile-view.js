import { db } from '../../firebase-init.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// PRIDANÝ EXPORT
export async function renderStudentProfile(studentId) {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `<div class="p-8">Načítání profilu studenta...</div>`;

    try {
        const studentRef = doc(db, "students", studentId);
        const studentSnap = await getDoc(studentRef);

        if (studentSnap.exists()) {
            const student = studentSnap.data();
            const registrationDate = student.createdAt ? new Date(student.createdAt.seconds * 1000).toLocaleString() : 'Neznámé datum';
             mainContent.innerHTML = `
                <div class="p-8">
                    <h2 class="text-3xl font-bold mb-4">Profil studenta</h2>
                    <div class="bg-white p-6 rounded-lg shadow">
                        <p><strong>Email:</strong> ${student.email}</p>
                        <p><strong>Datum registrace:</strong> ${registrationDate}</p>
                        <p class="mt-4"><strong>Token pro Telegram:</strong> 
                           <span class="bg-gray-100 p-1 rounded font-mono">${student.telegramConnectionToken || 'Není k dispozici'}</span>
                        </p>
                    </div>
                </div>
            `;
        } else {
             mainContent.innerHTML = `<div class="p-8 text-red-500">Student nebyl nalezen.</div>`;
        }
    } catch (error) {
        console.error("Error fetching student profile:", error);
        mainContent.innerHTML = `<div class="p-8 text-red-500">Chyba při načítání profilu studenta.</div>`;
    }
}
