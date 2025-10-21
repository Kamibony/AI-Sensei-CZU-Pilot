// Súbor: public/js/views/professor/student-profile-view.js
// Verzia: Plná, rešpektujúca pôvodnú štruktúru + Multi-Profesor

import { doc, getDoc, collection, query, where, orderBy, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"; // <-- ZMENA 1: Pridané 'where', 'updateDoc'
import { db } from '../../firebase-init.js';
import { showToast } from '../../utils.js';

let interactionsUnsubscribe = null;
let quizSubmissionsUnsubscribe = null;
let testSubmissionsUnsubscribe = null;

/**
 * Vykreslí pohled pro profil studenta.
 * @param {HTMLElement} container - Kontejner, kam se má obsah vykreslit.
 * @param {string} studentId - ID studenta.
 * @param {function} onBack - Callback pro návrat na seznam studentů.
 * @param {string} professorId - ID přihlášeného profesora.
 */
export async function renderStudentProfile(container, studentId, onBack, professorId) { // <-- ZMENA 2: Pridaný 'professorId'
    
    // Zrušení předchozích listenerů
    if (interactionsUnsubscribe) interactionsUnsubscribe();
    if (quizSubmissionsUnsubscribe) quizSubmissionsUnsubscribe();
    if (testSubmissionsUnsubscribe) testSubmissionsUnsubscribe();

    container.innerHTML = `
        <header class="p-6 border-b border-slate-200 bg-white flex items-center">
            <button id="back-to-students-btn" class="p-2 rounded-full hover:bg-slate-100 mr-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            </button>
            <div id="student-profile-header">
                <p class="text-slate-500">Načítám profil...</p>
            </div>
        </header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div class="lg:col-span-2 space-y-6">
                <div class="bg-white p-6 rounded-2xl shadow-lg">
                    <h2 class="text-xl font-bold text-slate-700 mb-4">Přehled pokroku</h2>
                    <div id="progress-overview-container" class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <p class="text-slate-500">Načítám pokrok...</p>
                    </div>
                </div>
                <div class="bg-white p-6 rounded-2xl shadow-lg">
                    <h2 class="text-xl font-bold text-slate-700 mb-4">Nedávná aktivita</h2>
                    <ul id="activity-feed-container" class="space-y-4">
                        <p class="text-slate-500">Načítám aktivitu...</p>
                    </ul>
                </div>
            </div>
            
            <div class="lg:col-span-1 space-y-6">
                <div class="bg-white p-6 rounded-2xl shadow-lg">
                    <h2 class="text-xl font-bold text-slate-700 mb-4">Interní poznámky</h2>
                    <textarea id="student-notes-textarea" class="w-full h-32 p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="Sem si můžete psát poznámky o studentovi..."></textarea>
                    <button id="save-notes-btn" class="mt-2 px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800">Uložit poznámky</button>
                </div>
                <div class="bg-white p-6 rounded-2xl shadow-lg">
                    <h2 class="text-xl font-bold text-slate-700 mb-4">Poslední interakce</h2>
                    <ul id="interactions-list-container" class="space-y-3">
                        <p class="text-slate-500">Načítám interakce...</p>
                    </ul>
                </div>
            </div>
            
        </div>
    `;

    document.getElementById('back-to-students-btn').addEventListener('click', onBack);

    if (!professorId) {
        container.innerHTML = `<p class="text-red-500 p-8">Chyba: Nebyl poskytnut identifikátor profesora. Nelze načíst data.</p>`;
        return;
    }

    loadStudentData(studentId);
    loadProgressOverview(studentId, professorId);
    loadActivityFeed(studentId, professorId);
    loadInteractionsList(studentId, professorId);
}

/**
 * Načte základní data o studentovi a jeho poznámky.
 * @param {string} studentId 
 */
async function loadStudentData(studentId) {
    const headerContainer = document.getElementById('student-profile-header');
    const notesTextarea = document.getElementById('student-notes-textarea');
    const saveNotesBtn = document.getElementById('save-notes-btn');

    try {
        const studentRef = doc(db, 'students', studentId);
        const studentSnap = await getDoc(studentRef);

        if (studentSnap.exists()) {
            const student = studentSnap.data();
            headerContainer.innerHTML = `
                <h1 class="text-3xl font-extrabold text-slate-800">${student.name || 'Student bez jména'}</h1>
                <p class="text-slate-500 mt-1">${student.email}</p>
            `;
            notesTextarea.value = student.notes || '';

            saveNotesBtn.addEventListener('click', async () => {
                saveNotesBtn.disabled = true;
                saveNotesBtn.innerHTML = '<div class="spinner-small"></div>';
                try {
                    await updateDoc(studentRef, {
                        notes: notesTextarea.value
                    });
                    showToast("Poznámky uloženy.", false);
                } catch (error) {
                    console.error("Chyba při ukládání poznámek: ", error);
                    showToast("Chyba při ukládání poznámek.", true);
                } finally {
                    saveNotesBtn.disabled = false;
                    saveNotesBtn.innerHTML = 'Uložit poznámky';
                }
            });

        } else {
            headerContainer.innerHTML = `<h1 class="text-3xl font-extrabold text-red-500">Student nenalezen</h1>`;
        }
    } catch (error) {
        console.error("Chyba při načítání studenta: ", error);
        headerContainer.innerHTML = `<h1 class="text-3xl font-extrabold text-red-500">Chyba při načítání</h1>`;
    }
}

/**
 * Načte přehled pokroku (počet lekcí, kvízů, testů).
 * @param {string} studentId
 * @param {string} professorId
 */
async function loadProgressOverview(studentId, professorId) {
    const container = document.getElementById('progress-overview-container');
    try {
        // Získání celkového počtu publikovaných lekcí profesora
        // --- ZMENA 3: Cesta k 'lessons' ---
        const lessonsQuery = query(
            collection(db, 'professors', professorId, 'lessons'), 
            where("isPublished", "==", true)
        );
        const lessonsSnap = await getDocs(lessonsQuery);
        const totalLessons = lessonsSnap.size;

        // TODO: Načíst reálný počet dokončených lekcí studentem
        const completedLessons = 0; // Placeholder

        // Získání průměrného skóre z kvízů
        // --- ZMENA 4: Cesta k 'quizSubmissions' ---
        const quizQuery = query(
            collection(db, 'professors', professorId, 'quizSubmissions'), 
            where("studentId", "==", studentId)
        );
        const quizSnap = await getDocs(quizQuery);
        let totalQuizScore = 0;
        quizSnap.docs.forEach(doc => {
            totalQuizScore += doc.data().score;
        });
        const avgQuizScore = quizSnap.size > 0 ? (totalQuizScore / quizSnap.size).toFixed(0) : 'N/A';

        // Získání průměrného skóre z testů
        // --- ZMENA 5: Cesta k 'testSubmissions' ---
        const testQuery = query(
            collection(db, 'professors', professorId, 'testSubmissions'), 
            where("studentId", "==", studentId)
        );
        const testSnap = await getDocs(testQuery);
        let totalTestScore = 0;
        testSnap.docs.forEach(doc => {
            totalTestScore += doc.data().score;
        });
        const avgTestScore = testSnap.size > 0 ? (totalTestScore / testSnap.size).toFixed(0) : 'N/A';


        container.innerHTML = `
            <div class="bg-slate-50 p-4 rounded-lg">
                <span class="text-sm font-medium text-slate-500">Dokončené lekce</span>
                <p class="text-2xl font-bold text-slate-800">${completedLessons} / ${totalLessons}</p>
            </div>
            <div class="bg-slate-50 p-4 rounded-lg">
                <span class="text-sm font-medium text-slate-500">Průměr (Kvízy)</span>
                <p class="text-2xl font-bold text-slate-800">${avgQuizScore}${avgQuizScore !== 'N/A' ? '%' : ''}</p>
            </div>
            <div class="bg-slate-50 p-4 rounded-lg">
                <span class="text-sm font-medium text-slate-500">Průměr (Testy)</span>
                <p class="text-2xl font-bold text-slate-800">${avgTestScore}${avgTestScore !== 'N/A' ? '%' : ''}</p>
            </div>
        `;

    } catch (error) {
        console.error("Chyba při načítání pokroku: ", error);
        container.innerHTML = '<p class="text-red-500">Chyba při načítání pokroku.</p>';
    }
}

/**
 * Načte feed nedávné aktivity (kvízy, testy).
 * @param {string} studentId
 * @param {string} professorId
 */
function loadActivityFeed(studentId, professorId) {
    const container = document.getElementById('activity-feed-container');
    
    // Kombinujeme listenery pro kvízy a testy
    // TODO: Toto je zjednodušené, pro reálnou "activity feed" by to chtělo robustnější řešení
    // (např. jednotnou kolekci 'activities' nebo merge na straně klienta)

    // --- ZMENA 6: Cesta k 'quizSubmissions' ---
    const quizQuery = query(
        collection(db, 'professors', professorId, 'quizSubmissions'),
        where("studentId", "==", studentId),
        orderBy("submittedAt", "desc"),
        // limit(5) // TODO: Přidat limit
    );
    
    // --- ZMENA 7: Cesta k 'testSubmissions' ---
    const testQuery = query(
        collection(db, 'professors', professorId, 'testSubmissions'),
        where("studentId", "==", studentId),
        orderBy("submittedAt", "desc"),
        // limit(5) // TODO: Přidat limit
    );

    let activities = [];
    let quizLoaded = false;
    let testLoaded = false;

    const renderActivities = () => {
        if (!quizLoaded || !testLoaded) return; // Počkáme na oba listenery

        if (activities.length === 0) {
            container.innerHTML = '<p class="text-slate-500">Zatím žádná aktivita.</p>';
            return;
        }

        // Seřadíme všechny aktivity dohromady
        activities.sort((a, b) => b.timestamp - a.timestamp);
        // Vezmeme posledních X
        const recentActivities = activities.slice(0, 10); 

        container.innerHTML = recentActivities.map(activity => {
            const date = activity.timestamp.toDate().toLocaleString();
            let icon, text;
            if (activity.type === 'quiz') {
                icon = '❓';
                text = `Odevzdal kvíz <span class="font-semibold">${activity.lessonTitle || 'Neznámý'}</span> se skóre ${activity.score}%.`;
            } else { // test
                icon = '✅';
                text = `Odevzdal test <span class="font-semibold">${activity.lessonTitle || 'Neznámý'}</span> se skóre ${activity.score}%.`;
            }
            
            return `
                <li class="flex items-start space-x-3">
                    <div class="flex-shrink-0 w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">${icon}</div>
                    <div>
                        <p class="text-sm text-slate-700">${text}</p>
                        <span class="text-xs text-slate-500">${date}</span>
                    </div>
                </li>
            `;
        }).join('');
    };

    quizSubmissionsUnsubscribe = onSnapshot(quizQuery, (snapshot) => {
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            activities.push({
                type: 'quiz',
                score: data.score,
                lessonTitle: data.lessonTitle, // Ujistěte se, že toto ukládáte
                timestamp: data.submittedAt,
                id: doc.id
            });
        });
        // Odstranění duplikátů, pokud by listener běžel vícekrát
        activities = [...new Map(activities.map(item => [item.id, item])).values()];
        quizLoaded = true;
        renderActivities();
    }, (error) => { console.error("Error quiz feed: ", error); quizLoaded = true; renderActivities(); });

    testSubmissionsUnsubscribe = onSnapshot(testQuery, (snapshot) => {
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            activities.push({
                type: 'test',
                score: data.score,
                lessonTitle: data.lessonTitle, // Ujistěte se, že toto ukládáte
                timestamp: data.submittedAt,
                id: doc.id
            });
        });
        activities = [...new Map(activities.map(item => [item.id, item])).values()];
        testLoaded = true;
        renderActivities();
    }, (error) => { console.error("Error test feed: ", error); testLoaded = true; renderActivities(); });
}

/**
 * Načte seznam posledních interakcí (zpráv) studenta.
 * @param {string} studentId
 * @param {string} professorId
 */
function loadInteractionsList(studentId, professorId) {
    const container = document.getElementById('interactions-list-container');
    
    // --- ZMENA 8: Cesta k 'studentInteractions' ---
    const q = query(
        collection(db, 'professors', professorId, 'studentInteractions'),
        where("studentId", "==", studentId),
        orderBy("timestamp", "desc")
        // limit(5) // TODO: Přidat limit
    );

    interactionsUnsubscribe = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-slate-500">Zatím žádné interakce.</p>';
            return;
        }

        container.innerHTML = snapshot.docs.map(doc => {
            const msg = doc.data();
            const date = msg.timestamp.toDate().toLocaleDateString();
            const isStudent = msg.role === 'student';
            
            return `
                <li class="border-b border-slate-100 pb-2">
                    <div class="flex justify-between text-xs text-slate-500 mb-1">
                        <span class="font-medium ${isStudent ? 'text-green-700' : 'text-slate-600'}">${isStudent ? 'Student' : 'Sensei'}</span>
                        <span>${date}</span>
                    </div>
                    <p class="text-sm text-slate-700">${msg.text.substring(0, 70)}${msg.text.length > 70 ? '...' : ''}</p>
                </li>
            `;
        }).join('');

    }, (error) => {
        console.error("Chyba při načítání interakcí: ", error);
        container.innerHTML = '<p class="text-red-500">Chyba při načítání interakcí.</p>';
    });
}
