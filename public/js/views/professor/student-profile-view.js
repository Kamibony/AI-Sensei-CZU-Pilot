import { getDoc, doc, collection, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function renderStudentProfile(container, db, studentId, backCallback) {
    container.innerHTML = `<div class="p-8"><div class="text-center">Načítání dat studenta...</div></div>`;

    try {
        // 1. Fetch Data
        const studentDocRef = doc(db, 'students', studentId);
        const studentDoc = await getDoc(studentDocRef);

        if (!studentDoc.exists()) {
            container.innerHTML = `<div class="p-8 text-red-500">Student s ID ${studentId} nebyl nalezen.</div>`;
            return;
        }
        const studentData = studentDoc.data();

        const submissionsQuery = query(
            collection(db, "quiz_submissions"),
            where("studentId", "==", studentId)
        );
        const testSubmissionsQuery = query(
            collection(db, "test_submissions"),
            where("studentId", "==", studentId)
        );

        const [submissionsSnapshot, testSubmissionsSnapshot] = await Promise.all([
            getDocs(submissionsQuery),
            getDocs(testSubmissionsQuery)
        ]);

        let allSubmissions = [];
        submissionsSnapshot.forEach(doc => allSubmissions.push({ type: 'Kvíz', ...doc.data() }));
        testSubmissionsSnapshot.forEach(doc => allSubmissions.push({ type: 'Test', ...doc.data() }));

        // Sort by date, newest first
        allSubmissions.sort((a, b) => b.submittedAt.toMillis() - a.submittedAt.toMillis());

        // 2. Render the UI
        renderUI(container, studentData, allSubmissions, backCallback);

    } catch (error) {
        console.error("Error rendering student profile:", error);
        container.innerHTML = `<div class="p-8 text-red-500">Došlo k chybě při načítání profilu studenta.</div>`;
    }
}

function renderUI(container, studentData, allSubmissions, backCallback) {
    container.innerHTML = `
        <div class="p-6 md:p-8">
            <button id="back-to-list-btn" class="mb-6 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                Zpět na seznam studentů
            </button>

            <div class="mb-8">
                <h1 class="text-3xl font-bold text-gray-800">${studentData.name}</h1>
                <p class="text-lg text-gray-500">${studentData.email}</p>
            </div>

            <!-- Tabs -->
            <div class="border-b border-gray-200">
                <nav class="-mb-px flex space-x-8" aria-label="Tabs">
                    <button id="tab-overview" class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300">
                        Přehled
                    </button>
                    <button id="tab-results" class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm border-green-500 text-green-600">
                        Výsledky
                    </button>
                </nav>
            </div>

            <!-- Tab Content -->
            <div id="tab-content" class="mt-8">
                <!-- Content will be injected here -->
            </div>
        </div>
    `;

    const tabOverviewBtn = container.querySelector('#tab-overview');
    const tabResultsBtn = container.querySelector('#tab-results');
    const tabContent = container.querySelector('#tab-content');

    const renderOverview = () => {
        tabContent.innerHTML = `
            <div class="bg-white p-6 rounded-lg shadow">
                 <h2 class="text-xl font-semibold mb-4">Přehled studenta</h2>
                 <p><strong>Jméno:</strong> ${studentData.name}</p>
                 <p><strong>Email:</strong> ${studentData.email}</p>
                 <p class="mt-4 text-gray-500 italic">AI-powered analysis and key metrics for this student will be displayed here in the future.</p>
            </div>
        `;
        updateTabStyles(tabOverviewBtn, tabResultsBtn);
    };

    const renderResults = () => {
        tabContent.innerHTML = `
            <div class="bg-white p-6 rounded-lg shadow">
                <h2 class="text-xl font-semibold mb-4">Historie výsledků</h2>
                ${renderSubmissionsTable(allSubmissions)}
            </div>
        `;
        updateTabStyles(tabResultsBtn, tabOverviewBtn);
    };

    tabOverviewBtn.addEventListener('click', renderOverview);
    tabResultsBtn.addEventListener('click', renderResults);
    container.querySelector('#back-to-list-btn').addEventListener('click', backCallback);

    // Initial render
    renderResults();
}

function updateTabStyles(activeBtn, inactiveBtn) {
    activeBtn.classList.add('border-green-500', 'text-green-600');
    activeBtn.classList.remove('text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');

    inactiveBtn.classList.remove('border-green-500', 'text-green-600');
    inactiveBtn.classList.add('text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
}

function renderSubmissionsTable(submissions) {
    if (submissions.length === 0) {
        return '<p class="text-gray-500">Tento student zatím neodevzdal žádné testy ani kvízy.</p>';
    }

    const rows = submissions.map(sub => {
        const score = typeof sub.score === 'number' ? `${(sub.score * 100).toFixed(0)}%` : 'N/A';
        const date = sub.submittedAt.toDate().toLocaleDateString('cs-CZ');
        return `
            <tr class="border-b">
                <td class="py-3 px-4">${sub.lessonName || 'N/A'}</td>
                <td class="py-3 px-4">${sub.type}</td>
                <td class="py-3 px-4">${score}</td>
                <td class="py-3 px-4">${date}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="overflow-x-auto">
            <table class="min-w-full text-left">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="py-3 px-4 font-semibold">Lekce</th>
                        <th class="py-3 px-4 font-semibold">Typ</th>
                        <th class="py-3 px-4 font-semibold">Skóre</th>
                        <th class="py-3 px-4 font-semibold">Datum</th>
                    </tr>
                </thead>
                <tbody class="bg-white">
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}