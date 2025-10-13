import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function renderResultsView(container, db) {
    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white">
            <h1 class="text-3xl font-extrabold text-slate-800">Výsledky studentů</h1>
            <p class="text-slate-500 mt-1">Přehled všech odevzdaných kvízů a testů.</p>
        </header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6">
            <div id="results-list-container" class="bg-white p-6 rounded-2xl shadow-lg">
                <p class="text-center p-8 text-slate-400">Načítám výsledky...</p>
            </div>
        </div>`;

    const resultsContainer = document.getElementById('results-list-container');

    try {
        const studentsQuery = query(collection(db, 'students'));
        const lessonsQuery = query(collection(db, 'lessons'));
        const quizzesQuery = query(collection(db, 'quiz_submissions'), orderBy("submittedAt", "desc"));
        const testsQuery = query(collection(db, 'test_submissions'), orderBy("submittedAt", "desc"));

        const [studentsSnapshot, lessonsSnapshot, quizzesSnapshot, testsSnapshot] = await Promise.all([
            getDocs(studentsQuery),
            getDocs(lessonsQuery),
            getDocs(quizzesQuery),
            getDocs(testsQuery)
        ]);

        const studentsMap = new Map(studentsSnapshot.docs.map(doc => [doc.id, doc.data()]));
        const lessonsMap = new Map(lessonsSnapshot.docs.map(doc => [doc.id, doc.data()]));

        const quizResults = quizzesSnapshot.docs.map(doc => ({ ...doc.data(), type: 'Kvíz' }));
        const testResults = testsSnapshot.docs.map(doc => ({ ...doc.data(), type: 'Test' }));

        const allResults = [...quizResults, ...testResults].sort((a, b) => b.submittedAt.toMillis() - a.submittedAt.toMillis());

        if (allResults.length === 0) {
            resultsContainer.innerHTML = '<p class="text-center p-8 text-slate-500">Zatím nebyly odevzdány žádné kvízy ani testy.</p>';
            return;
        }

        const resultsHtml = allResults.map(result => {
            const student = studentsMap.get(result.studentId);
            const lesson = lessonsMap.get(result.lessonId);
            const isTest = result.type === 'Test';
            const scorePercentage = (result.score / result.totalQuestions) * 100;

            let scoreColor = 'text-slate-600';
            if (scorePercentage >= 80) scoreColor = 'text-green-600';
            else if (scorePercentage >= 50) scoreColor = 'text-amber-600';
            else scoreColor = 'text-red-600';

            return `
                <tr class="border-b border-slate-100 hover:bg-slate-50">
                    <td class="p-3">
                        <p class="font-semibold text-slate-800">${student?.name || 'Neznámý student'}</p>
                        <p class="text-xs text-slate-500">${student?.email || ''}</p>
                    </td>
                    <td class="p-3">
                        <p class="text-slate-700">${lesson?.title || 'Neznámá lekce'}</p>
                    </td>
                    <td class="p-3">
                        <span class="text-xs font-medium px-2 py-1 rounded-full ${isTest ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
                            ${isTest ? '✅ Test' : '❓ Kvíz'}
                        </span>
                    </td>
                    <td class="p-3 font-bold ${scoreColor}">
                        ${result.score} / ${result.totalQuestions}
                    </td>
                    <td class="p-3 text-sm text-slate-500">
                        ${result.submittedAt.toDate().toLocaleString('cs-CZ')}
                    </td>
                </tr>
            `;
        }).join('');

        resultsContainer.innerHTML = `
            <table class="w-full text-left">
                <thead>
                    <tr class="border-b border-slate-200">
                        <th class="p-3 text-sm font-semibold text-slate-500">Student</th>
                        <th class="p-3 text-sm font-semibold text-slate-500">Lekce</th>
                        <th class="p-3 text-sm font-semibold text-slate-500">Typ</th>
                        <th class="p-3 text-sm font-semibold text-slate-500">Skóre</th>
                        <th class="p-3 text-sm font-semibold text-slate-500">Odevzdáno</th>
                    </tr>
                </thead>
                <tbody>
                    ${resultsHtml}
                </tbody>
            </table>
        `;

    } catch (error) {
        console.error("Error rendering results view:", error);
        resultsContainer.innerHTML = '<p class="text-center p-8 text-red-500">Při načítání výsledků došlo k chybě.</p>';
    }
}