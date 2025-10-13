import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, query, orderBy, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { renderEditorMenu } from './editor-handler.js';
import { showToast } from './utils.js';
import { db } from './firebase-init.js';
import { initializeCourseMediaUpload, renderMediaLibraryFiles } from './upload-handler.js';
import { handleLogout } from './auth.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from './firebase-init.js';
import { setupProfessorNav } from './views/professor/navigation.js';
import { renderTimeline } from './views/professor/timeline-view.js';
import { renderStudentsView } from './views/professor/students-view.js';
import { renderResultsView } from './views/professor/results-view.js';
import { renderStudentInteractions } from './views/professor/interactions-view.js';

let lessonsData = [];
const MAIN_COURSE_ID = "main-course"; 
const sendMessageToStudent = httpsCallable(functions, 'sendMessageToStudent');
let conversationsUnsubscribe = null;
let studentsUnsubscribe = null;

function getLocalizedDate(offsetDays = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return date.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' });
}

async function fetchLessons() {
    try {
        const lessonsCollection = collection(db, 'lessons');
        const querySnapshot = await getDocs(query(lessonsCollection, orderBy("createdAt")));
        lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return true;
    } catch (error) {
        console.error("Error fetching lessons for professor: ", error);
        showToast("Nepodařilo se načíst data lekcí.", true);
        return false;
    }
}

export async function initProfessorDashboard() {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;
    
    roleContentWrapper.innerHTML = `
        <div id="dashboard-professor" class="w-full flex main-view active h-screen">
            <aside id="professor-sidebar" class="w-full md:w-96 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 h-full"></aside>
            <main id="main-content-area" class="flex-grow bg-slate-50 flex flex-col h-screen"></main>
        </div>
    `;

    setupProfessorNav(showProfessorContent);
    document.getElementById('logout-btn-nav').addEventListener('click', handleLogout);

    const lessonsLoaded = await fetchLessons();
    if (!lessonsLoaded) {
        document.getElementById('main-content-area').innerHTML = `<div class="p-8 text-center text-red-500">Chyba při načítání dat.</div>`;
        return;
    }
    showProfessorContent('timeline');
}

async function showProfessorContent(view, lesson = null) {
    if (conversationsUnsubscribe) { conversationsUnsubscribe(); conversationsUnsubscribe = null; }
    if (studentsUnsubscribe) { studentsUnsubscribe(); studentsUnsubscribe = null; }

    const sidebar = document.getElementById('professor-sidebar');
    const mainArea = document.getElementById('main-content-area');
    if (!sidebar || !mainArea) return;

    sidebar.style.display = 'flex';
    mainArea.style.display = 'flex';

    if (view === 'editor') {
        renderEditorMenu(sidebar, lesson);
    } else if (['media', 'students', 'interactions', 'analytics', 'results'].includes(view)) {
        sidebar.style.display = 'none';
        if (view === 'media') renderMediaLibrary(mainArea);
        if (view === 'students') studentsUnsubscribe = renderStudentsView(mainArea, db, studentsUnsubscribe);
        if (view === 'interactions') conversationsUnsubscribe = renderStudentInteractions(mainArea, db, functions, conversationsUnsubscribe);
        if (view === 'analytics') renderAnalytics(mainArea);
        if (view === 'results') renderResultsView(mainArea, db);
    } else { 
        await fetchLessons();
        renderLessonLibrary(sidebar);
        renderTimeline(mainArea, db, lessonsData);
    }
}

function renderLessonLibrary(container) {
    const lessonsHtml = lessonsData.map(lesson => `
        <div class="lesson-bubble-wrapper group p-1" data-lesson-id="${lesson.id}">
            <div class="lesson-bubble-in-library p-4 bg-white border rounded-lg cursor-pointer hover:shadow-md flex justify-between items-center">
                <div>
                    <h3 class="font-semibold text-slate-800">${lesson.title}</h3>
                    <p class="text-sm text-slate-500">${lesson.subtitle || ' '}</p>
                </div>
                <button class="delete-lesson-btn p-1 rounded-full text-slate-400 hover:bg-red-200 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" data-lesson-id="${lesson.id}" title="Smazat lekci">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
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
                    await deleteDoc(doc(db, 'lessons', lessonId));
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


function renderMediaLibrary(container) {
    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white"><h1 class="text-3xl font-extrabold text-slate-800">Knihovna médií</h1><p class="text-slate-500 mt-1">Spravujte všechny soubory pro váš kurz na jednom místě.</p></header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6"><div class="bg-white p-6 rounded-2xl shadow-lg"><p class="text-slate-500 mb-4">Nahrajte soubory (PDF), které chcete použít pro generování obsahu.</p><div id="course-media-upload-area" class="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center text-slate-500 cursor-pointer hover:bg-green-50 hover:border-green-400"><p class="font-semibold">Přetáhněte soubory sem nebo klikněte pro výběr</p></div><input type="file" id="course-media-file-input" multiple class="hidden" accept=".pdf"><h3 class="font-bold text-slate-700 mt-6 mb-2">Nahrané soubory:</h3><ul id="course-media-list" class="space-y-2"></ul></div></div>`;
    initializeCourseMediaUpload(MAIN_COURSE_ID);
    renderMediaLibraryFiles(MAIN_COURSE_ID);
}

function renderAnalytics(container) {
    container.className = 'flex-grow bg-slate-50 p-4 sm:p-6 md:p-8 overflow-y-auto view-transition';
    container.innerHTML = `
        <h1 class="text-3xl font-extrabold text-slate-800 mb-6">AI Analýza Studentů</h1>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="bg-white p-6 rounded-2xl shadow-lg col-span-1 lg:col-span-2">
                <h2 class="font-bold text-lg mb-4">Zapojení studentů v čase</h2>
                <div class="h-64 bg-slate-50 rounded-lg flex items-end justify-around p-4" id="chart-container"></div>
            </div>
             <div class="bg-white p-6 rounded-2xl shadow-lg space-y-4">
                <h2 class="font-bold text-lg mb-2">Klíčové metriky</h2>
                <div><p class="text-3xl font-bold text-green-600">88%</p><p class="text-sm text-slate-500">Průměrná úspěšnost v kvízech</p></div>
                <div><p class="text-3xl font-bold text-amber-800">32 min</p><p class="text-sm text-slate-500">Průměrný čas strávený v lekci</p></div>
                <div><p class="text-3xl font-bold text-amber-600">3</p><p class="text-sm text-slate-500">Průměrný počet dotazů na AI asistenta</p></div>
            </div>
        </div>
        <div class="mt-6 bg-white p-6 rounded-2xl shadow-lg">
             <h2 class="font-bold text-lg mb-4">AI doporučení a postřehy</h2>
             <div class="space-y-3 text-sm">
                <p class="p-3 bg-green-50 text-green-800 rounded-lg">✅ <strong>Silná stránka:</strong> Studenti skvěle rozumí konceptu 'vlnově-korpuskulární dualismus'.</p>
                <p class="p-3 bg-amber-50 text-amber-800 rounded-lg">⚠️ <strong>Příležitost ke zlepšení:</strong> Mnoho studentů se ptá na praktické využití 'principu superpozice'. Doporučujeme přidat konkrétní příklad z reálného světa (např. kvantové počítače).</p>
                <p class="p-3 bg-blue-50 text-blue-800 rounded-lg">💡 <strong>Návrh na interakci:</strong> Zvažte vytvoření krátkého kvízu zaměřeného specificky na rozdíl mezi klasickou a kvantovou fyzikou pro upevnění znalostí.</p>
             </div>
        </div>
        <div class="mt-6 bg-white p-6 rounded-2xl shadow-lg">
             <h2 class="font-bold text-lg mb-4">AI Identifikace skupin studentů</h2>
             <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="p-4 bg-green-50 rounded-lg border border-green-200">
                    <h3 class="font-bold text-green-800">Vynikající studenti (2)</h3>
                    <p class="text-xs text-green-700 mt-1">Vysoká úspěšnost, rychlé plnění. Zvažte doplňkové materiály pro pokročilé.</p>
                </div>
                <div class="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 class="font-bold text-blue-800">Aktivní studenti (12)</h3>
                    <p class="text-xs text-blue-700 mt-1">Průměrné výsledky, ale vysoká aktivita. Potřebují upevnit klíčové pojmy.</p>
                </div>
                <div class="p-4 bg-red-50 rounded-lg border border-red-200">
                    <h3 class="font-bold text-red-800">Studenti vyžadující pozornost (1)</h3>
                    <p class="text-xs text-red-700 mt-1">Nízká aktivita i úspěšnost. Doporučujeme osobní konzultaci.</p>
                </div>
             </div>
        </div>
     `;
     
    const chartContainer = document.getElementById('chart-container');
    const chartData = [60, 75, 50, 85, 95, 70, 80];
    chartData.forEach((height, index) => {
        const bar = document.createElement('div');
        bar.className = 'w-8 bg-green-400 rounded-t-lg';
        bar.title = `Týden ${index + 1}: ${height}%`;
        bar.style.transition = `height 0.5s ease-out ${index * 0.05}s`;
        bar.style.height = '0%';
        chartContainer.appendChild(bar);
        setTimeout(() => { bar.style.height = `${height}%`; }, 100);
    });
}
