import { db } from '../../firebase-init.js';
import { collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// TOTO JE JEDINÁ ZMENA -> pridali sme slovo 'export'
export async function renderInteractions(lessonId) {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <div class="p-8">
            <h2 class="text-2xl font-bold mb-4">Interakce pro lekci ${lessonId}</h2>
            <div id="interactions-list">Načítání...</div>
        </div>
    `;

    try {
        const interactionsList = document.getElementById('interactions-list');
        const q = query(
            collection(db, "lessons", lessonId, "interactions"),
            orderBy("timestamp", "desc")
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            interactionsList.innerHTML = '<p>Pro tuto lekci nebyly nalezeny žádné interakce.</p>';
            return;
        }

        let html = '<div class="space-y-4">';
        querySnapshot.forEach(doc => {
            const data = doc.data();
            const date = data.timestamp ? data.timestamp.toDate().toLocaleString() : 'Neznámé datum';
            const roleClass = data.role === 'user' ? 'bg-blue-100' : 'bg-gray-100';
            html += `
                <div class="p-4 rounded ${roleClass}">
                    <p class="font-semibold">${data.role === 'user' ? 'Student' : 'AI Asistent'} <span class="text-sm text-gray-500 float-right">${date}</span></p>
                    <p>${data.text}</p>
                </div>
            `;
        });
        html += '</div>';
        interactionsList.innerHTML = html;

    } catch (error) {
        console.error("Error rendering interactions:", error);
        document.getElementById('interactions-list').innerHTML = '<p class="text-red-500">Nepodařilo se načíst interakce.</p>';
    }
}
