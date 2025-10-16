import { collection, getDocs, doc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { renderEditorMenu } from './editor-handler.js';
import { showToast } from './utils.js';
import { db, functions } from './firebase-init.js';
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

function renderLessonLibrary(container, showProfessorContent) {
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

async function showProfessorContent(view, data = null) {
    if (conversationsUnsubscribe) { conversationsUnsubscribe(); conversationsUnsubscribe = null; }
    if (studentsUnsubscribe) { studentsUnsubscribe(); studentsUnsubscribe = null; }

    const sidebar = document.getElementById('professor-sidebar');
    const mainArea = document.getElementById('main-content-area');
    if (!sidebar || !mainArea) return;

    sidebar.style.display = 'flex';
    mainArea.style.display = 'flex';

    const navigateToStudentProfile = (studentId) => {
        showProfessorContent('student-profile', studentId);
    };

    switch (view) {
        case 'editor':
            renderEditorMenu(sidebar, data); // data je tu objekt lekcie
            break;
        case 'student-profile':
            sidebar.style.display = 'none';
            const backToHub = () => showProfessorContent('students');
            renderStudentProfile(mainArea, db, data, backToHub); // data je tu studentId
            break;
        case 'media':
            sidebar.style.display = 'none';
            mainArea.innerHTML = `<header class="text-center p-6 border-b border-slate-200 bg-white"><h1 class="text-3xl font-extrabold text-slate-800">Knihovna médií</h1><p class="text-slate-500 mt-1">Spravujte všechny soubory pro váš kurz na jednom místě.</p></header>
                                  <div class="flex-grow overflow-y-auto p-4 md:p-6"><div class="bg-white p-6 rounded-2xl shadow-lg"><p class="text-slate-500 mb-4">Nahrajte soubory (PDF), které chcete použít pro generování obsahu.</p><div id="course-media-upload-area" class="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center text-slate-500 cursor-pointer hover:bg-green-50 hover:border-green-400"><p class="font-semibold">Přetáhněte soubory sem nebo klikněte pro výběr</p></div><input type="file" id="course-media-file-input" multiple class="hidden" accept=".pdf"><h3 class="font-bold text-slate-700 mt-6 mb-2">Nahrané soubory:</h3><ul id="course-media-list" class="space-y-2"></ul></div></div>`;
            initializeCourseMediaUpload("main-course");
            renderMediaLibraryFiles("main-course");
            break;
        case 'students':
            sidebar.style.display = 'none';
            studentsUnsubscribe = renderStudentsView(mainArea, db, studentsUnsubscribe, navigateToStudentProfile);
            break;
        case 'interactions':
            sidebar.style.display = 'none';
            conversationsUnsubscribe = renderStudentInteractions(mainArea, db, functions, conversationsUnsubscribe);
            break;
        case 'analytics':
             sidebar.style.display = 'none';
             mainArea.innerHTML = `<p class="p-8">Sekce Analýza se připravuje.</p>`;
             break;
        default: // 'timeline'
            await fetchLessons();
            renderLessonLibrary(sidebar, showProfessorContent);
            await renderTimeline(mainArea, db, lessonsData);
            break;
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

    const logoutBtn = document.getElementById('logout-btn-nav');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    const lessonsLoaded = await fetchLessons();
    if (!lessonsLoaded) {
        document.getElementById('main-content-area').innerHTML = `<div class="p-8 text-center text-red-500">Chyba při načítání dat.</div>`;
        return;
    }
    showProfessorContent('timeline');
}
