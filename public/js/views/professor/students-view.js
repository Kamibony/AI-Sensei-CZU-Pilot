import { collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function renderStudentsView(container, db, studentsUnsubscribe) {
    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white"><h1 class="text-3xl font-extrabold text-slate-800">Správa studentů</h1><p class="text-slate-500 mt-1">Zobrazte seznam zapsaných studentů.</p></header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6"><div id="students-list-container" class="bg-white p-6 rounded-2xl shadow-lg"><p class="text-center p-8 text-slate-400">Načítám studenty...</p></div></div>`;

    const containerEl = document.getElementById('students-list-container');
    const q = query(collection(db, 'students'), orderBy("createdAt", "desc"));

    if (studentsUnsubscribe) studentsUnsubscribe();

    studentsUnsubscribe = onSnapshot(q, (querySnapshot) => {
        const students = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (students.length === 0) {
            containerEl.innerHTML = '<p class="text-center p-8 text-slate-500">Zatím se nezaregistroval žádný student.</p>';
            return;
        }

        const studentsHtml = students.map(student => `
            <div class="flex items-center justify-between p-3 border-b border-slate-100">
                <div><p class="text-slate-800 font-semibold">${student.name || 'Jméno neuvedeno'}</p><p class="text-sm text-slate-500">${student.email}</p></div>
                <span class="text-xs font-medium px-2 py-1 rounded-full ${student.telegramChatId ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'}">${student.telegramChatId ? 'Telegram připojen' : 'Telegram nepřipojen'}</span>
            </div>`).join('');

        containerEl.innerHTML = `<div class="divide-y divide-slate-100">${studentsHtml}</div>`;
    }, (error) => {
        console.error("Error fetching students:", error);
        containerEl.innerHTML = '<p class="text-center p-8 text-red-500">Nepodařilo se načíst studenty.</p>';
    });
    return studentsUnsubscribe;
}