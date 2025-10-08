import { collection, getDocs, doc, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
import { db } from './firebase-init.js';
import { renderEditorMenu } from './editor-handler.js';

let lessonsData = [];

async function fetchLessons() {
    try {
        const lessonsCollection = collection(db, 'lessons');
        const querySnapshot = await getDocs(lessonsCollection);
        lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return true;
    } catch (error) {
        console.error("Error fetching lessons for professor: ", error);
        showToast("Nepodařilo se načíst data lekcí.", true);
        return false;
    }
}

export async function initProfessorDashboard() {
    const lessonsLoaded = await fetchLessons();
    const roleContentWrapper = document.getElementById('role-content-wrapper');

    if (!roleContentWrapper) {
        console.error("role-content-wrapper not found!");
        return;
    }

    if (!lessonsLoaded) {
        roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Chyba při načítání dat.</div>`;
        return;
    }

    roleContentWrapper.innerHTML = `
        <div id="dashboard-professor" class="w-full flex main-view active">
            <aside id="professor-sidebar" class="w-full md:w-96 bg-white border-r border-slate-200 flex flex-col flex-shrink-0"></aside>
            <main id="main-content-area" class="flex-grow bg-slate-100 flex flex-col h-screen"></main>
        </div>
    `;
    setupProfessorNav();
    showProfessorContent('timeline'); // Default to timeline view
}

function setupProfessorNav() {
    const nav = document.getElementById('main-nav');
    if (nav) {
        nav.innerHTML = `
            <li><button data-view="timeline" class="nav-item p-3 rounded-lg flex items-center justify-center text-white bg-green-700" title="Plánovač"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button></li>
        `;
        nav.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                showProfessorContent(view);
                nav.querySelectorAll('.nav-item').forEach(b => {
                    b.classList.remove('bg-green-700', 'text-white');
                    b.classList.add('text-green-200', 'hover:bg-green-700', 'hover:text-white');
                });
                e.currentTarget.classList.add('bg-green-700', 'text-white');
            });
        });
    }
}

async function showProfessorContent(view, lesson = null) {
    const dashboardView = document.getElementById('dashboard-professor');
    if (!dashboardView) return;

    dashboardView.classList.remove('hidden');

    const sidebar = document.getElementById('professor-sidebar');

    if (view === 'editor') {
        renderEditorMenu(sidebar, lesson);
    } else {
        await fetchLessons();
        renderLessonLibrary(sidebar);
        const mainArea = document.getElementById('main-content-area');
        renderTimeline(mainArea);
    }
}

function renderLessonLibrary(container) {
    const lessonsHtml = lessonsData.map(lesson => `
        <div class="lesson-bubble-in-library p-4 mb-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-green-100" data-lesson-id="${lesson.id}" draggable="true">
            <h3 class="font-semibold text-slate-800">${lesson.title}</h3>
            <p class="text-sm text-slate-500">${lesson.subtitle}</p>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="p-4 border-b">
            <h2 class="text-xl font-bold">Knihovna lekcí</h2>
        </div>
        <div class="p-4 overflow-y-auto" id="lesson-list-container">
            ${lessonsHtml}
        </div>
        <div class="p-4 border-t">
            <button id="add-new-lesson-btn" class="w-full p-3 bg-green-700 text-white rounded-lg hover:bg-green-800">Přidat novou lekci</button>
        </div>
    `;

    container.querySelectorAll('.lesson-bubble-in-library').forEach(el => {
        el.addEventListener('click', () => {
            const lessonId = el.dataset.lessonId;
            const selectedLesson = lessonsData.find(l => l.id === lessonId);
            showProfessorContent('editor', selectedLesson);
        });
    });

    container.querySelector('#add-new-lesson-btn').addEventListener('click', async () => {
        const newLessonData = { title: 'Nová lekce', subtitle: 'Krátký popis', icon: '🆕', content: '', status: 'Naplánováno' };
        const docRef = await addDoc(collection(db, 'lessons'), newLessonData);
        showProfessorContent('editor', { id: docRef.id, ...newLessonData });
    });
}

async function renderTimeline(container) {
    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white">
            <h1 class="text-3xl font-extrabold text-slate-800">Plán výuky</h1>
            <p class="text-slate-500 mt-1">Naplánujte lekce přetažením z knihovny vlevo.</p>
        </header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6">
            <div id="timeline-dropzone" class="p-4 min-h-[400px] bg-slate-200/50 rounded-lg border-2 border-dashed">Zde přetáhněte lekce...</div>
        </div>`;

    const dropzone = container.querySelector('#timeline-dropzone');
    new Sortable(dropzone, {
        group: 'lessons',
        animation: 150,
        onAdd: async (evt) => {
            const lessonId = evt.item.dataset.lessonId;
            console.log(`Lesson ${lessonId} was dropped into the timeline.`);
            showToast(`Lekce ${lessonId} naplánována (logika ukládání chybí).`);
        }
    });
}