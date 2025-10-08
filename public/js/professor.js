import { collection, getDocs, getDoc, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { initializeUpload, initializeCourseMediaUpload, renderMediaLibraryFiles } from './upload-handler.js';
import { showToast } from './utils.js';
import { callGeminiApi, callGeminiForJson, callGenerateFromDocument } from './gemini-api.js';
import { db, functions } from './firebase-init.js'; // Import services directly
import { getEditorContent, attachEditorEventListeners, initializeEditor } from './editor-handler.js';


let lessonsData = [];
let currentLesson = null;

async function fetchLessons() {
    try {
        const lessonsCollection = collection(db, 'lessons');
        const querySnapshot = await getDocs(lessonsCollection);
        lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Professor lessons fetched:", lessonsData);
        return true;
    } catch (error) {
        console.error("Error fetching lessons for professor: ", error);
        showToast("Nepodařilo se načíst data lekcí pro profesora.", true);
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
    showProfessorContent('library');
}

function setupProfessorNav() {
    const nav = document.getElementById('main-nav');
    if (nav) {
        nav.innerHTML = `
            <li><button data-view="library" class="nav-item p-3 rounded-lg flex items-center justify-center text-white bg-green-700" title="Knihovna lekcí"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></button></li>
            <li><button data-view="timeline" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white" title="Plánovač"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button></li>
        `;
        nav.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                showProfessorContent(e.currentTarget.dataset.view);
                nav.querySelectorAll('.nav-item').forEach(b => b.classList.remove('bg-green-700', 'text-white'));
                e.currentTarget.classList.add('bg-green-700', 'text-white');
            });
        });
    }
}

function showProfessorContent(view, lesson = null) {
    const sidebar = document.getElementById('professor-sidebar');
    const mainContent = document.getElementById('main-content-area');

    if (lesson) {
        currentLesson = lesson;
        initializeEditor(currentLesson);
        sidebar.innerHTML = renderEditorMenu();
        mainContent.innerHTML = `<div class="p-8 overflow-y-auto">${getEditorContent('details')}</div>`;
        attachEditorEventListeners('details');

        const filesViewContent = getEditorContent('files');
        const editorNav = sidebar.querySelector('#editor-nav');
        if (editorNav) {
            const filesButton = editorNav.querySelector('button[data-view="files"]');
            if (filesButton) {
                filesButton.addEventListener('click', () => {
                    document.getElementById('main-content-area').innerHTML = `<div class="p-8 overflow-y-auto">${filesViewContent}</div>`;
                    initializeUpload(currentLesson);
                });
            }
        }

    } else {
        switch (view) {
            case 'library':
                sidebar.innerHTML = renderLessonLibrary();
                mainContent.innerHTML = `<div class="p-8 text-center text-slate-400">Vyberte lekci pro editaci nebo vytvořte novou.</div>`;
                break;
            case 'timeline':
                 sidebar.innerHTML = renderLessonLibrary(); // Show lessons for drag-and-drop
                 mainContent.innerHTML = renderTimeline();
                 break;
            default:
                mainContent.innerHTML = `<div class="p-8">Obsah pro '${view}' se připravuje.</div>`;
        }
    }

    sidebar.querySelectorAll('.lesson-bubble-in-library').forEach(el => {
        el.addEventListener('click', () => {
            const lessonId = el.dataset.lessonId;
            const selectedLesson = lessonsData.find(l => l.id === lessonId);
            showProfessorContent(null, selectedLesson);
        });
    });
}

function renderLessonLibrary() {
    const sortedLessons = [...lessonsData].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    const lessonsHtml = sortedLessons.map(lesson => `
        <div class="lesson-bubble-in-library p-4 mb-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-green-100" data-lesson-id="${lesson.id}" draggable="true">
            <h3 class="font-semibold text-slate-800">${lesson.title}</h3>
            <p class="text-sm text-slate-500">${lesson.subtitle}</p>
        </div>
    `).join('');

    return `
        <div class="p-4 border-b">
            <h2 class="text-xl font-bold">Knihovna lekcí</h2>
        </div>
        <div class="p-4 overflow-y-auto">
            ${lessonsHtml}
             <button id="add-new-lesson-btn" class="w-full mt-4 p-3 bg-green-700 text-white rounded-lg hover:bg-green-800">Přidat novou lekci</button>
        </div>
    `;
}

function renderEditorMenu() {
    return `
        <div class="p-4 border-b flex items-center justify-between">
            <button id="back-to-library-btn" class="text-green-700 hover:underline">&larr; Zpět na přehled</button>
            <h2 class="text-xl font-bold">Editor Lekce</h2>
        </div>
        <div class="flex-grow p-4 overflow-y-auto">
            <ul id="editor-nav" class="space-y-2">
                <li><button data-view="details" class="editor-nav-item w-full text-left p-3 rounded-lg bg-green-100 font-semibold">Detaily lekce</button></li>
                <li><button data-view="text" class="editor-nav-item w-full text-left p-3 rounded-lg">Hlavní text</button></li>
                <li><button data-view="files" class="editor-nav-item w-full text-left p-3 rounded-lg">Soubory</button></li>
            </ul>
        </div>
    `;
}

function renderTimeline() {
    return `<div class="p-8"><h1 class="text-2xl font-bold">Plánovač (Timeline)</h1><p class="mt-4 text-slate-600">Přetáhněte lekce z knihovny do časové osy pro naplánování.</p><div id="timeline-dropzone" class="mt-4 p-8 min-h-[400px] bg-white rounded-lg border-2 border-dashed"></div></div>`;
}

document.getElementById('role-content-wrapper').addEventListener('click', async (e) => {
    if (e.target.id === 'add-new-lesson-btn') {
        const newLesson = { title: 'Nová lekce', subtitle: 'Krátký popis', icon: '🆕', content: 'Tato lekce zatím nemá žádný obsah.' };
        const docRef = await addDoc(collection(db, 'lessons'), newLesson);
        newLesson.id = docRef.id;
        lessonsData.push(newLesson);
        showProfessorContent(null, newLesson);
    }
    if (e.target.id === 'back-to-library-btn') {
        await fetchLessons();
        showProfessorContent('library');
    }
    if (e.target.classList.contains('editor-nav-item')) {
        const viewId = e.target.dataset.view;
        document.getElementById('main-content-area').innerHTML = `<div class="p-8 overflow-y-auto">${getEditorContent(viewId)}</div>`;
        attachEditorEventListeners(viewId);
        document.querySelectorAll('.editor-nav-item').forEach(btn => btn.classList.remove('bg-green-100', 'font-semibold'));
        e.target.classList.add('bg-green-100', 'font-semibold');
        if (viewId === 'files') {
            initializeUpload(currentLesson);
        }
    }
});