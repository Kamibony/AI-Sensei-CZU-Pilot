// === CELÝ OBSAH SÚBORU public/js/views/professor/student-profile-view.js ===

import { getDoc, doc, collection, query, where, getDocs, orderBy, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"; // Pridaný Timestamp
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from "../../utils.js";

let currentStudent = null; // Uchováme si dáta študenta pre prepínanie tabov

// === PRIDANÝ LAZY LOADER PRE AI FUNKCIU ===
let _getAiStudentSummaryCallable = null;

function getAiStudentSummaryCallable() {
    if (!_getAiStudentSummaryCallable) {
        if (!firebaseInit.functions) {
            console.error("CRITICAL: Firebase Functions object is not available for getAiStudentSummaryCallable!");
            showToast("Chyba inicializace funkcí.", true);
            throw new Error("Firebase Functions not initialized.");
        }
        _getAiStudentSummaryCallable = httpsCallable(firebaseInit.functions, 'getAiStudentSummary');
    }
    return _getAiStudentSummaryCallable;
}
// === KONIEC PRIDANÉHO KÓDU ===

export async function renderStudentProfile(container, db, studentId, backCallback) {
    container.innerHTML = `<div class="p-8"><div class="text-center">Načítání dat studenta...</div></div>`;

    try {
        // 1. Fetch Data - Len dáta študenta, ostatné sa načítajú v taboch
        const studentDocRef = doc(db, 'students', studentId);
        const studentDoc = await getDoc(studentDocRef);

        if (!studentDoc.exists()) {
            container.innerHTML = `<div class="p-8 text-red-500">Student s ID ${studentId} nebyl nalezen.</div>`;
            return;
        }
        currentStudent = { id: studentDoc.id, ...studentDoc.data() }; // Uložíme dáta

        // 2. Render the UI Shell
        renderUIShell(container, currentStudent, backCallback);

        // 3. Initial render - Zobraziť prehľad ako prvý
        await switchTab('overview'); // Zmenené na async

    } catch (error) {
        console.error("Error rendering student profile shell:", error);
        container.innerHTML = `<div class="p-8 text-red-500">Došlo k chybě při načítání profilu studenta.</div>`;
    }
}

function renderUIShell(container, studentData, backCallback) {
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

            <div class="border-b border-gray-200">
                <nav class="-mb-px flex space-x-8" aria-label="Tabs">
                    <button id="tab-overview" data-tab="overview" class="student-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300">
                        Přehled
                    </button>
                    <button id="tab-results" data-tab="results" class="student-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300"> {/* Defaultne neaktívny */}
                        Výsledky
                    </button>
                </nav>
            </div>

            <div id="tab-content" class="mt-8">
                </div>
        </div>
    `;

    // Pridanie listenerov na taby a späť tlačidlo
    container.querySelectorAll('.student-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    container.querySelector('#back-to-list-btn').addEventListener('click', backCallback);
}

async function switchTab(tabId) { // Zmenené na async
    if (!currentStudent) return; // Kontrola, či máme dáta študenta

    const tabContent = document.getElementById('tab-content');
    if (!tabContent) return;
    tabContent.innerHTML = '<p class="text-center p-8 text-slate-400">Načítám obsah...</p>'; // Loading state

    // Aktualizovať vzhľad tabov
    document.querySelectorAll('.student-tab-btn').forEach(btn => {
        const isActive = btn.dataset.tab === tabId;
        btn.classList.toggle('border-green-500', isActive);
        btn.classList.toggle('text-green-600', isActive);
        btn.classList.toggle('text-gray-500', !isActive);
        btn.classList.toggle('hover:text-gray-700', !isActive);
        btn.classList.toggle('hover:border-gray-300', !isActive);
    });

    // Zobraziť správny obsah
    if (tabId === 'overview') {
        await renderOverviewContent(tabContent, currentStudent); // Zmenené na async
    } else if (tabId === 'results') {
        await renderResultsContent(tabContent, currentStudent); // Zmenené na async
    }
}

// === UPRAVENÁ FUNKCIA renderOverviewContent (predtým renderOverview) ===
async function renderOverviewContent(container, student) {
    container.innerHTML = `
        <div class="bg-white p-6 rounded-lg shadow">
            <h2 class="text-xl font-semibold mb-4">Přehled studenta</h2>
            <p><strong>Jméno:</strong> ${student.name}</p>
            <p><strong>Email:</strong> ${student.email}</p>
            <div class="mt-6 border-t pt-6" id="ai-summary-container">
                 <p class="text-slate-500 animate-pulse">Generuji AI analýzu...</p>
                 <p class="text-xs text-slate-400 mt-2">Analyzuji poslední aktivitu, výsledky testů a konverzace...</p>
            </div>
        </div>
    `;

    const summaryContainer = document.getElementById('ai-summary-container');
    if (!summaryContainer) return;

    try {
        const getSummary = getAiStudentSummaryCallable();
        const result = await getSummary({ studentId: student.id });

        if (!document.getElementById('ai-summary-container')) return; // Check if still on the same tab

        // Formátovanie odpovede z AI (prevod markdown na HTML)
        let formattedSummary = result.data.summary || "AI nevrátila žádný souhrn."; // Handle empty summary
        formattedSummary = formattedSummary
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
            .replace(/\*(.*?)\*/g, '<em>$1</em>')     // Italic
            .replace(/\n\* /g, '<br>• ')              // Bullet points (*)
            .replace(/\n\d+\. /g, (match) => `<br>${match.trim()} `) // Numbered lists (1., 2.)
            .replace(/\n/g, '<br>');                  // Newlines

        summaryContainer.innerHTML = `
            <h3 class="text-lg font-semibold text-green-800 mb-3">AI Postřehy</h3>
            <div class="prose prose-sm max-w-none text-slate-800">${formattedSummary}</div>
        `;
    } catch (error) {
        console.error("Error fetching AI summary:", error);
         if (!document.getElementById('ai-summary-container')) return; // Check again
        summaryContainer.innerHTML = `
            <h3 class="text-lg font-semibold text-red-600 mb-3">Chyba analýzy</h3>
            <p class="text-red-500">Analýzu se nepodařilo vygenerovat.</p>
            <p class="text-xs text-slate-400 mt-1">${error.message}</p>
        `;
        showToast("Nepodařilo se vygenerovat AI analýzu.", true);
    }
}
// === KONIEC UPRAVENEJ FUNKCIE ===

// Funkcia na načítanie a zobrazenie výsledkov
async function renderResultsContent(container, student) {
    try {
        // Načítame dáta priamo tu
        const quizQuery = query(
            collection(firebaseInit.db, "quiz_submissions"),
            where("studentId", "==", student.id),
            orderBy('submittedAt', 'desc') // Zoradenie pre prehľadnosť
        );
        const testQuery = query(
            collection(firebaseInit.db, "test_submissions"),
            where("studentId", "==", student.id),
            orderBy('submittedAt', 'desc')
        );

        const [quizSnapshot, testSnapshot] = await Promise.all([
            getDocs(quizQuery),
            getDocs(testQuery)
        ]);

        let allSubmissions = [];
        quizSnapshot.forEach(doc => {
            const data = doc.data();
            allSubmissions.push({ type: 'Kvíz', lessonName: data.quizTitle || 'N/A', ...data }); // Pridaný lessonName
        });
        testSnapshot.forEach(doc => {
            const data = doc.data();
            allSubmissions.push({ type: 'Test', lessonName: data.testTitle || 'N/A', ...data }); // Pridaný lessonName
        });

        // Sort by date, newest first
        allSubmissions.sort((a, b) => (b.submittedAt?.toMillis() || 0) - (a.submittedAt?.toMillis() || 0)); // Bezpečnejšie zoradenie

         if (!document.getElementById('tab-content')) return; // Check if still on the same tab

        container.innerHTML = `
            <div class="bg-white p-6 rounded-lg shadow">
                <h2 class="text-xl font-semibold mb-4">Historie výsledků</h2>
                ${renderSubmissionsTable(allSubmissions)}
            </div>
        `;
    } catch (error) {
        console.error("Error fetching submissions:", error);
        if (document.getElementById('tab-content')) { // Check if still on the same tab
             container.innerHTML = '<p class="text-center p-8 text-red-500">Nepodařilo se načíst aktivitu studenta.</p>';
        }
        showToast("Chyba při načítání výsledků studenta.", true);
    }
}

// Zostáva rovnaká
function renderSubmissionsTable(submissions) {
    if (submissions.length === 0) {
        return '<p class="text-gray-500">Tento student zatím neodevzdal žádné testy ani kvízy.</p>';
    }

    const rows = submissions.map(sub => {
        const score = typeof sub.score === 'number' ? `${(sub.score * 100).toFixed(0)}%` : 'N/A';
        // Skontrolujeme, či submittedAt existuje a je Timestamp
        const date = (sub.submittedAt instanceof Timestamp)
                      ? sub.submittedAt.toDate().toLocaleDateString('cs-CZ')
                      : 'Neznámé datum';
        const scoreClass = typeof sub.score === 'number'
                          ? (sub.score >= 0.5 ? 'text-green-600' : 'text-red-600')
                          : 'text-gray-500';
        return `
            <tr class="border-b">
                <td class="py-3 px-4">${sub.lessonName || 'Neznámá lekce'}</td> {/* Používame lessonName */}
                <td class="py-3 px-4">${sub.type}</td>
                <td class="py-3 px-4 font-semibold ${scoreClass}">${score}</td>
                <td class="py-3 px-4 text-sm text-gray-500">${date}</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="overflow-x-auto">
            <table class="min-w-full text-left text-sm">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="py-2 px-4 font-semibold text-gray-600">Lekce / Název</th>
                        <th class="py-2 px-4 font-semibold text-gray-600">Typ</th>
                        <th class="py-2 px-4 font-semibold text-gray-600">Skóre</th>
                        <th class="py-2 px-4 font-semibold text-gray-600">Datum odevzdání</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-100">
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

// Cleanup funkcia pre unsubscribe - už nie je potrebná v tomto súbore,
// lebo onSnapshot sa nepoužíva globálne pre profil.
export function cleanupStudentProfileView() {
    // Ak by ste v budúcnosti pridali onSnapshot, odkomentujte:
    // if (studentDataUnsubscribe) {
    //     studentDataUnsubscribe();
    //     studentDataUnsubscribe = null;
    // }
    // if (submissionsUnsubscribe) {
    //     submissionsUnsubscribe();
    //     submissionsUnsubscribe = null;
    // }
    currentStudent = null; // Resetovať dáta pri odchode z pohľadu
    console.log("Cleaned up student profile view data.");
}
