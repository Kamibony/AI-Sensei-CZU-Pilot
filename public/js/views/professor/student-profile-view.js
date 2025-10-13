import { doc, getDoc, collection, query, where, getDocs, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from '../../utils.js';
import { db } from '../../firebase-init.js';

// --- OPRAVA: Pridané kľúčové slovo "export" ---
export async function showStudentProfile(container, studentId, backCallback) {
    try {
        const studentRef = doc(db, 'students', studentId);
        const studentSnap = await getDoc(studentRef);

        if (!studentSnap.exists()) {
            throw new Error("Student not found");
        }
        const studentData = studentSnap.data();

        container.innerHTML = `
            <header class="text-center p-6 border-b border-slate-200 bg-white">
                <button id="back-to-hub-btn" class="absolute top-6 left-6 text-green-700 font-semibold hover:underline">&larr; Zpět na přehled</button>
                <h1 class="text-3xl font-extrabold text-slate-800">${studentData.name || 'Student'}</h1>
                <p class="text-slate-500 mt-1">${studentData.email}</p>
            </header>
            <div id="student-profile-content" class="flex-grow overflow-y-auto p-4 md:p-6">
                <p class="text-center text-slate-500">Načítám data o aktivitě studenta...</p>
            </div>`;

        document.getElementById('back-to-hub-btn').addEventListener('click', backCallback);

        const contentEl = document.getElementById('student-profile-content');
        
        // Načítanie výsledkov kvízov a testov
        const quizSubmissionsRef = collection(db, 'quiz_submissions');
        const testSubmissionsRef = collection(db, 'test_submissions');

        const quizQuery = query(quizSubmissionsRef, where("studentId", "==", studentId), orderBy("submittedAt", "desc"));
        const testQuery = query(testSubmissionsRef, where("studentId", "==", studentId), orderBy("submittedAt", "desc"));

        const [quizSnapshot, testSnapshot] = await Promise.all([getDocs(quizQuery), getDocs(testQuery)]);

        const quizzes = quizSnapshot.docs.map(doc => doc.data());
        const tests = testSnapshot.docs.map(doc => doc.data());

        renderStudentActivity(contentEl, quizzes, tests);

    } catch (error) {
        console.error("Error showing student profile:", error);
        showToast("Nepodařilo se načíst profil studenta.", true);
        container.innerHTML = `<p class="p-8 text-center text-red-500">Chyba při načítání profilu.</p>`;
    }
}

function renderStudentActivity(container, quizzes, tests) {
    const quizzesHtml = quizzes.length > 0 ? quizzes.map(q => `
        <div class="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div class="flex justify-between items-center">
                <p class="font-semibold text-blue-800">Kvíz: ${q.quizTitle}</p>
                <p class="font-bold text-lg ${q.score / q.totalQuestions > 0.7 ? 'text-green-600' : 'text-orange-500'}">${q.score}/${q.totalQuestions}</p>
            </div>
            <p class="text-xs text-slate-500 mt-1">${new Date(q.submittedAt.seconds * 1000).toLocaleString()}</p>
        </div>
    `).join('') : '<p class="text-sm text-slate-400">Žádné odevzdané kvízy.</p>';

    const testsHtml = tests.length > 0 ? tests.map(t => `
         <div class="p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <div class="flex justify-between items-center">
                <p class="font-semibold text-purple-800">Test: ${t.testTitle}</p>
                <p class="font-bold text-lg ${t.score / t.totalQuestions > 0.7 ? 'text-green-600' : 'text-red-600'}">${t.score}/${t.totalQuestions}</p>
            </div>
            <p class="text-xs text-slate-500 mt-1">${new Date(t.submittedAt.seconds * 1000).toLocaleString()}</p>
        </div>
    `).join('') : '<p class="text-sm text-slate-400">Žádné odevzdané testy.</p>';

    container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white p-6 rounded-2xl shadow-lg">
                <h2 class="text-xl font-bold text-slate-800 mb-4">Odevzdané Kvízy</h2>
                <div class="space-y-3">${quizzesHtml}</div>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-lg">
                <h2 class="text-xl font-bold text-slate-800 mb-4">Odevzdané Testy</h2>
                <div class="space-y-3">${testsHtml}</div>
            </div>
        </div>
    `;
}
