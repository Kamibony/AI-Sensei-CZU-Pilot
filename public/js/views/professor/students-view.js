// --- OPRAVA: Pridané kľúčové slovo "export" ---
export function renderStudentList(container, students, onStudentClick) {
    const studentsHtml = students.map(student => `
        <div class="student-list-item p-4 bg-white border rounded-lg cursor-pointer hover:shadow-md flex justify-between items-center" data-student-id="${student.id}">
            <div>
                <h3 class="font-semibold text-slate-800">${student.name || 'Meno neuvedené'}</h3>
                <p class="text-sm text-slate-500">${student.email}</p>
            </div>
        </div>
    `).join('');

    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white">
            <h1 class="text-3xl font-extrabold text-slate-800">Přehled Studentů</h1>
        </header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6">
            <div class="space-y-4">
                ${studentsHtml.length > 0 ? studentsHtml : '<p class="text-center text-slate-500 p-8">Zatím se nezaregistrovali žádní studenti.</p>'}
            </div>
        </div>
    `;

    container.querySelectorAll('.student-list-item').forEach(item => {
        item.addEventListener('click', () => {
            onStudentClick(item.dataset.studentId);
        });
    });
}
