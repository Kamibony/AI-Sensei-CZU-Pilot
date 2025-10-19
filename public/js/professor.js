import { collection, getDocs, doc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { renderEditorMenu } from './editor-handler.js';
// === PRIDANÉ IMPORTY ===
import { showToast } from './utils.js';
import * as firebaseInit from './firebase-init.js'; // Zmenené na import *
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
// === KONIEC PRIDANÝCH IMPORTOV ===
import { initializeCourseMediaUpload, renderMediaLibraryFiles } from './upload-handler.js';
import { setupProfessorNav } from './views/professor/navigation.js';
import { renderTimeline } from './views/professor/timeline-view.js';
import { renderStudentsView } from './views/professor/students-view.js';
import { renderStudentProfile } from './views/professor/student-profile-view.js';
import { renderStudentInteractions } from './views/professor/interactions-view.js';
import { handleLogout } from './auth.js';

let lessonsData = [];
let conversationsUnsubscribe = null;
let studentsUnsubscribe = null;

// === PRIDANÝ LAZY LOADER ===
let _getGlobalAnalyticsCallable = null;

function getGlobalAnalyticsCallable() {
    if (!_getGlobalAnalyticsCallable) {
        if (!firebaseInit.functions) {
            console.error("CRITICAL: Firebase Functions object is not available for getGlobalAnalyticsCallable!");
            showToast("Chyba inicializace funkcí.", true);
            throw new Error("Firebase Functions not initialized.");
        }
        _getGlobalAnalyticsCallable = httpsCallable(firebaseInit.functions, 'getGlobalAnalytics');
    }
    return _getGlobalAnalyticsCallable;
}
// === KONIEC PRIDANÉHO KÓDU ===

async function fetchLessons() {
    try {
        const lessonsCollection = collection(firebaseInit.db, 'lessons'); // Používame importovaný db
        const querySnapshot = await getDocs(query(lessonsCollection, orderBy("createdAt")));
        lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return true;
    } catch (error) {
        console.error("Error fetching lessons for professor: ", error);
        showToast("Nepodařilo se načíst data lekcí.", true);
        return false;
    }
}

function renderLessonLibrary(container, showProfessorContent) {
    const lessonsHtml = lessonsData.map(lesson => `
        <div class="lesson-bubble-wrapper group p-1" data-lesson-id="${lesson.id}">
            <div class="lesson-bubble-in-library p-4 bg-white border rounded-lg cursor-pointer hover:shadow-md flex justify-between items-center">
                <div>
                    <h3 class="font-semibold text-slate-800">${lesson.title}</h3>
                    <p class="text-sm text-slate-500">${lesson.subtitle || ' '}</p>
                </div>
                <button class="delete-lesson-btn p-1 rounded-full text-slate-400 hover:bg-red-200 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" data-lesson-id="${lesson.id}" title="Smazat lekci">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2 2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>
    `).join('');

    container.innerHTML = `
        <header class="p-4 border-b border-slate-200 flex-shrink-0"><h2 class="text-xl font-bold text-slate-800">Knihovna lekcí</h2></header>
        <div class="flex-grow overflow-y-auto p-4" id="lesson-list-container">${lessonsHtml}</div>
        <footer class="p-4 border-t border-slate-200 flex-shrink-0"><button id="add-new-lesson-btn" class="w-full p-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800">Přidat novou lekci</button></footer>
    `;

    container.querySelectorAll('.lesson-bubble-in-library').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.delete-lesson-btn')) return;
            const lessonId = e.target.closest('.lesson-bubble-wrapper').dataset.lessonId;
            const selectedLesson = lessonsData.find(l => l.id === lessonId);
            showProfessorContent('editor', selectedLesson);
        });
    });

    container.querySelectorAll('.delete-lesson-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const lessonId = e.currentTarget.dataset.lessonId;
            const lessonToDelete = lessonsData.find(l => l.id === lessonId);
            if (confirm(`Opravdu chcete trvale smazat lekci "${lessonToDelete.title}"? Tato akce je nevratná.`)) {
                try {
                    await deleteDoc(doc(firebaseInit.db, 'lessons', lessonId)); // Používame importovaný db
                    showToast('Lekce byla smazána.');
                    await initProfessorDashboard();
                } catch (error) {
                    console.error("Error deleting lesson:", error);
                    showToast("Chyba při mazání lekce.", true);
                }
            }
        });
    });

    container.querySelector('#add-new-lesson-btn').addEventListener('click', () => showProfessorContent('editor', null));

    const listEl = container.querySelector('#lesson-list-container');
    if (listEl && typeof Sortable !== 'undefined') {
        new Sortable(listEl, {
            group: { name: 'lessons', pull: 'clone', put: false },
            animation: 150,
            sort: false,
        });
    }
}

// === PREROBENÁ FUNKCIA showProfessorContent (predtým switchView) ===
async function showProfessorContent(view, data = null) {
    if (conversationsUnsubscribe) { conversationsUnsubscribe(); conversationsUnsubscribe = null; }
    if (studentsUnsubscribe) { studentsUnsubscribe(); studentsUnsubscribe = null; }

    const sidebar = document.getElementById('professor-sidebar');
    const mainArea = document.getElementById('main-content-area');
    if (!sidebar || !mainArea) return;

    // Defaultne zobrazíme oba panely
    sidebar.style.display = 'flex';
    mainArea.style.display = 'flex';
    // Vyčistíme obsah
    mainArea.innerHTML = '';
    sidebar.innerHTML = '';

    const navigateToStudentProfile = (studentId) => {
        showProfessorContent('student-profile', studentId);
    };
    
    // Špecifické zobrazenia, ktoré skryjú sidebar
    const fullWidthViews = ['students', 'student-profile', 'interactions', 'analytics', 'media'];
    if (fullWidthViews.includes(view)) {
         sidebar.style.display = 'none';
    } else {
         // Pre timeline a editor sidebar potrebujeme
         await fetchLessons(); // Znova načítame lekcie pre knižnicu
         renderLessonLibrary(sidebar, showProfessorContent);
    }

    switch (view) {
        case 'editor':
            renderEditorMenu(sidebar, data); // data je tu objekt lekcie alebo null
            // showEditorContent sa volá z renderEditorMenu
            break;
        case 'student-profile':
            const backToStudentsList = () => showProfessorContent('students');
            // ===== OPRAVA PARAMETROV PRE renderStudentProfile =====
            // 1. parameter: container
            // 2. parameter: studentId (čo je 'data')
            // 3. parameter: callback funkcia
            renderStudentProfile(mainArea, data, backToStudentsList);
            // =======================================================
            break;
        case 'media':
            mainArea.innerHTML = `<header class="text-center p-6 border-b border-slate-200 bg-white"><h1 class="text-3xl font-extrabold text-slate-800">Knihovna médií</h1><p class="text-slate-500 mt-1">Spravujte všechny soubory pro váš kurz na jednom místě.</p></header>
                                  <div class="flex-grow overflow-y-auto p-4 md:p-6"><div class="bg-white p-6 rounded-2xl shadow-lg"><p class="text-slate-500 mb-4">Nahrajte soubory (PDF), které chcete použít pro generování obsahu.</p><div id="course-media-upload-area" class="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center text-slate-500 cursor-pointer hover:bg-green-50 hover:border-green-400"><p class="font-semibold">Přetáhněte soubory sem nebo klikněte pro výběr</p></div><input type="file" id="course-media-file-input" multiple class="hidden" accept=".pdf"><h3 class="font-bold text-slate-700 mt-6 mb-2">Nahrané soubory:</h3><ul id="course-media-list" class="space-y-2"></ul></div></div>`;
            
            // ===== OPRAVA: Ponechané iba toto jedno volanie =====
            initializeCourseMediaUpload("main-course");
            // =================================================
            
            break;
        case 'students':
            // Zmenený názov funkcie a pridanie db
            studentsUnsubscribe = renderStudentsView(mainArea, firebaseInit.db, studentsUnsubscribe, navigateToStudentProfile);
            break;
        case 'interactions':
             // Zmenený názov funkcie a pridanie db a functions
            conversationsUnsubscribe = renderStudentInteractions(mainArea, firebaseInit.db, firebaseInit.functions, conversationsUnsubscribe);
            break;
        case 'analytics':
             mainArea.innerHTML = `
                <div class="p-6 md:p-8">
                    <h2 class="text-3xl font-extrabold text-slate-800 mb-6">Analýza platformy</h2>
                    <div id="analytics-loading" class="text-center text-slate-500">
                        <p>Načítám analytická data...</p>
                    </div>
                    <div id="analytics-content" class="hidden grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        </div>
                </div>`;

            try {
                const getAnalytics = getGlobalAnalyticsCallable();
                const result = await getAnalytics();
                const data = result.data;

                const contentContainer = document.getElementById('analytics-content');
                if (!contentContainer) break; // Ak sa medzitým zmenil pohľad

                // Karta 1: Počet študentov
                const studentCard = createStatCard('Celkový počet studentů', data.studentCount, '👥');

                // Karta 2: Priemerné skóre kvízov
                const quizCard = createStatCard('Průměrné skóre (Kvízy)', `${data.avgQuizScore}%`, '❓', `(z ${data.quizSubmissionCount} odevzdání)`);

                // Karta 3: Priemerné skóre testov
                const testCard = createStatCard('Průměrné skóre (Testy)', `${data.avgTestScore}%`, '✅', `(z ${data.testSubmissionCount} odevzdání)`);

                contentContainer.appendChild(studentCard);
                contentContainer.appendChild(quizCard);
                contentContainer.appendChild(testCard);

                // Karta 4: Najaktívnejší študenti
                const activityCard = document.createElement('div');
                activityCard.className = 'bg-white p-6 rounded-xl shadow-lg md:col-span-2 lg:col-span-3'; // Upravené pre lepšie zobrazenie
                let topStudentsHtml = (data.topStudents || []).map(student => // Kontrola na undefined
                    `<li class="flex justify-between items-center py-2 border-b last:border-b-0">
                        <span class="text-slate-700">${student.name}</span>
                        <span class="font-semibold text-green-700">${student.submissions} odevzdání</span>
                    </li>`
                ).join('');

                activityCard.innerHTML = `
                    <h4 class="text-lg font-semibold text-slate-800 mb-4">Top 5 nejaktivnějších studentů</h4>
                    <ul class="divide-y divide-slate-100">
                        ${topStudentsHtml || '<p class="text-slate-500 py-4">Žádná aktivita k zobrazení.</p>'}
                    </ul>
                `;
                contentContainer.appendChild(activityCard);

                // Skryť loading a zobraziť obsah
                const loadingEl = document.getElementById('analytics-loading');
                if (loadingEl) loadingEl.classList.add('hidden');
                contentContainer.classList.remove('hidden');

            } catch (error) {
                console.error("Error fetching analytics:", error);
                const loadingEl = document.getElementById('analytics-loading');
                if (loadingEl) {
                    loadingEl.innerHTML = `<p class="text-red-500">Nepodařilo se načíst analytická data: ${error.message}</p>`;
                }
                showToast("Chyba při načítání analýzy.", true);
            }
             break;
        default: // 'timeline'
            await renderTimeline(mainArea, firebaseInit.db, lessonsData);
            break;
    }
}
// === KONIEC PREROBENEJ FUNKCIE ===

// === PRIDANÁ POMOCNÁ FUNKCIA ===
function createStatCard(title, value, emoji, subtitle = '') {
    const card = document.createElement('div');
    card.className = 'bg-white p-6 rounded-xl shadow-lg flex items-center space-x-4';
    card.innerHTML = `
        <div class="text-4xl">${emoji}</div>
        <div>
            <h4 class="text-sm font-medium text-slate-500 uppercase tracking-wider">${title}</h4>
            <p class="text-3xl font-bold text-slate-900">${value}</p>
            ${subtitle ? `<p class="text-xs text-slate-400 mt-1">${subtitle}</p>` : ''}
        </div>
    `;
    return card;
}
// === KONIEC PRIDANEJ FUNKCIE ===

export async function initProfessorDashboard() {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    roleContentWrapper.innerHTML = `
        <div id="dashboard-professor" class="w-full flex main-view active h-screen">
            <aside id="professor-sidebar" class="w-full md:w-80 lg:w-96 bg-slate-100 border-r border-slate-200 flex flex-col flex-shrink-0 h-full"></aside>
            <main id="main-content-area" class="flex-grow bg-slate-50 flex flex-col h-screen overflow-y-auto"></main>
        </div>
    `;

    setupProfessorNav(showProfessorContent);

    const logoutBtn = document.getElementById('logout-btn-nav');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Načítanie dát a zobrazenie defaultného pohľadu
    const lessonsLoaded = await fetchLessons();
    if (!lessonsLoaded) {
        document.getElementById('main-content-area').innerHTML = `<div class="p-8 text-center text-red-500">Chyba při načítání dat lekcí.</div>`;
        return;
    }
    await showProfessorContent('timeline'); // Začíname s timeline
}
