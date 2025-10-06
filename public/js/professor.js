// public/js/professor.js

import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, setDoc, writeBatch, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { initializeUpload, initializeCourseMediaUpload, renderMediaLibraryFiles } from './upload-handler.js';

// --- MODULE STATE ---
let db;
let functions;
let showToast;
let lessonsData = [];
let currentLesson = null;
let currentUserRole = 'professor'; // This module is specific to the professor

// --- Callable Functions ---
let generateTextFunction;
let generateJsonFunction;
let generateFromDocument;
let sendMessageToStudent;

export function initializeProfessor(appDb, appFunctions, appShowToast) {
    db = appDb;
    functions = appFunctions;
    showToast = appShowToast;

    // Initialize callable functions
    generateTextFunction = httpsCallable(functions, 'generateText');
    generateJsonFunction = httpsCallable(functions, 'generateJson');
    generateFromDocument = httpsCallable(functions, 'generateFromDocument');
    sendMessageToStudent = httpsCallable(functions, 'sendMessageToStudent');
}

async function fetchLessons() {
    try {
        const lessonsCollection = collection(db, 'lessons');
        const querySnapshot = await getDocs(lessonsCollection);
        if (querySnapshot.empty) {
            lessonsData = [];
        } else {
            lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        console.log("Professor lessons fetched:", lessonsData);
    } catch (error) {
        console.error("Error fetching lessons:", error);
        showToast("Nepodařilo se načíst data lekcí.", true);
    }
}

export function setupProfessorNav() {
    const nav = document.getElementById('main-nav');
    if (!nav) return;
    nav.innerHTML = `
        <li><button data-view="timeline" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white transition-colors" title="Plán výuky"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button></li>
        <li><button id="media-library-btn" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white transition-colors" title="Knihovna médií"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button></li>
        <li><button data-view="interactions" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white transition-colors" title="Interakce se studenty"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button></li>
        <li><button data-view="analytics" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white transition-colors" title="Analýza studentů"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 2v6l6.1 2.4-4.2 6L2.5 22"/><path d="M21.5 2v6l-6.1 2.4 4.2 6L21.5 22"/><path d="M12 2v20"/></svg></button></li>
    `;
    nav.querySelector('[data-view="timeline"]').addEventListener('click', () => showProfessorContent('timeline'));
    nav.querySelector('#media-library-btn').addEventListener('click', () => {
        const modal = document.getElementById('media-library-modal');
        if (modal) {
            modal.classList.remove('hidden');
            const currentCourseId = 'default-course'; // Placeholder
            initializeCourseMediaUpload(currentCourseId);
            renderMediaLibraryFiles(currentCourseId);
            const closeBtn = document.getElementById('close-media-library-btn');
            if(closeBtn) {
                closeBtn.addEventListener('click', () => modal.classList.add('hidden'), { once: true });
            }
        }
    });
    const interactionsButton = nav.querySelector('[data-view="interactions"]');
    if (interactionsButton) {
        interactionsButton.addEventListener('click', (e) => {
            e.preventDefault();
            const currentCourseId = 'default-course'; // Placeholder
            renderTelegramInteractionView(currentCourseId);
        });
    }
    nav.querySelector('[data-view="analytics"]').addEventListener('click', (e) => {
        e.preventDefault();
        showProfessorContent('analytics');
    });
}

export async function initProfessorDashboard() {
    await fetchLessons();
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;
    roleContentWrapper.innerHTML = `<div id="dashboard-professor" class="w-full flex main-view active"><aside id="professor-sidebar" class="w-full md:w-96 bg-white border-r border-slate-200 flex flex-col flex-shrink-0"></aside><main id="main-content-area" class="flex-grow bg-slate-100 flex flex-col h-screen"></main></div>`;
    showProfessorContent('timeline');
}

async function showProfessorContent(view, lesson = null) {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    // Create main professor dashboard if it doesn't exist
    if (!document.getElementById('dashboard-professor')) {
        roleContentWrapper.innerHTML = `<div id="dashboard-professor" class="w-full flex main-view active"><aside id="professor-sidebar" class="w-full md:w-96 bg-white border-r border-slate-200 flex flex-col flex-shrink-0"></aside><main id="main-content-area" class="flex-grow bg-slate-100 flex flex-col h-screen"></main></div>`;
    }

    const sidebar = document.getElementById('professor-sidebar');
    const mainArea = document.getElementById('main-content-area');

    if (view === 'timeline') {
        await fetchLessons();
        renderLessonLibrary(sidebar);
        renderTimeline(mainArea);
    } else if (view === 'editor') {
        currentLesson = lesson;
        renderEditorMenu(sidebar);
        showEditorContent(lesson ? 'docs' : 'details');
    } else if (view === 'analytics') {
        renderAnalytics(mainArea);
    }
}

function renderLessonLibrary(container) {
    if (!container) return;
    container.innerHTML = `
        <header class="p-4 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
            <h2 class="text-xl font-bold text-slate-800">Knihovna lekcí</h2>
            <button id="create-new-lesson-btn" class="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800 transition transform hover:scale-105">+ Nová lekce</button>
        </header>
        <div class="flex-grow overflow-y-auto p-2">
            <div id="lesson-library-list"></div>
        </div>`;

    const listEl = container.querySelector('#lesson-library-list');
    const statuses = [
        { name: 'Naplánováno', id: 'lessons-scheduled' },
        { name: 'Aktivní', id: 'lessons-active' },
        { name: 'Archivováno', id: 'lessons-archived' }
    ];

    lessonsData.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

    listEl.innerHTML = statuses.map(statusInfo => `
        <div class="p-2">
            <h3 class="px-2 text-sm font-semibold text-slate-500 mb-2">${statusInfo.name}</h3>
            <div id="${statusInfo.id}" class="lesson-group min-h-[100px] p-2 bg-slate-50 rounded-lg border border-dashed border-slate-200" data-status="${statusInfo.name}">
            ${lessonsData.filter(l => l.status === statusInfo.name).map(lesson => `
                <div class="lesson-bubble-in-library p-3 mb-2 rounded-lg flex items-center justify-between bg-white border border-slate-200 hover:shadow-md hover:border-green-500 transition-all" data-id="${lesson.id}">
                    <div class="flex items-center space-x-3 cursor-pointer flex-grow" draggable="true">
                        <span class="text-2xl">${lesson.icon}</span>
                        <div>
                            <span class="font-semibold text-sm text-slate-700">${lesson.title}</span>
                            <p class="text-xs text-slate-500">${lesson.subtitle}</p>
                        </div>
                    </div>
                    <button class="delete-lesson-btn p-2 rounded-full hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors" data-id="${lesson.id}" title="Smazat lekci">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </div>
            `).join('') || `<p class="px-2 text-xs text-slate-400 italic">Žádné lekce v tomto stavu.</p>`}
            </div>
        </div>
    `).join('');

    container.querySelector('#create-new-lesson-btn').addEventListener('click', () => showProfessorContent('editor', null));
    container.querySelectorAll('.lesson-bubble-in-library').forEach(el => {
        const draggablePart = el.querySelector('[draggable="true"]');
        draggablePart.addEventListener('click', () => {
            const lesson = lessonsData.find(l => l.id == el.dataset.id);
            showProfessorContent('editor', lesson);
        });
        const deleteBtn = el.querySelector('.delete-lesson-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const lessonId = e.currentTarget.dataset.id;
                handleDeleteLesson(lessonId, e.currentTarget);
            });
        }
        draggablePart.addEventListener('dragstart', (e) => {
            e.currentTarget.closest('.lesson-bubble-in-library').classList.add('dragging');
            e.dataTransfer.setData('lesson_id', el.dataset.id);
        });
        draggablePart.addEventListener('dragend', (e) => {
            e.currentTarget.closest('.lesson-bubble-in-library').classList.remove('dragging');
        });
    });

    container.querySelectorAll('.lesson-group').forEach(groupEl => {
        new Sortable(groupEl, {
            group: {
                name: 'lesson-status',
                pull: (to, from) => (to.options.group.name === 'timeline-events' ? (from.el.id === 'lessons-active' ? 'clone' : false) : true),
                put: true
            },
            animation: 150,
            sort: true,
            ghostClass: 'blue-background-class',
            onAdd: async (evt) => {
                const itemEl = evt.item;
                const lessonId = itemEl.dataset.id;
                const newStatus = evt.to.dataset.status;
                if (!lessonId || !newStatus) return;
                try {
                    await updateDoc(doc(db, 'lessons', lessonId), { status: newStatus });
                    const lessonInData = lessonsData.find(l => l.id === lessonId);
                    if (lessonInData) lessonInData.status = newStatus;
                    renderLessonLibrary(document.getElementById('professor-sidebar'));
                } catch (error) {
                    console.error("Error updating lesson status:", error);
                    evt.from.appendChild(itemEl);
                    showToast("Chyba při změně stavu lekce.", true);
                }
            }
        });
    });
}

async function renderTimeline(container) {
    if (!container) return;
    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white">
            <h1 class="text-3xl font-extrabold text-slate-800">Plán výuky</h1>
            <p class="text-slate-500 mt-1">Naplánujte lekce přetažením z knihovny vlevo.</p>
        </header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6">
            <div id="timeline-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"></div>
        </div>`;

    const timelineContainer = container.querySelector('#timeline-container');
    const startDate = new Date('2025-10-01T12:00:00Z');
    const courseId = 'default-course';

    const q = query(collection(db, 'timeline_events'), where("courseId", "==", courseId));
    const querySnapshot = await getDocs(q);
    const timelineEvents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    for (let i = 0; i < 10; i++) {
        const dayDate = new Date(startDate);
        dayDate.setDate(startDate.getDate() + i);
        const dateString = dayDate.toISOString().split('T')[0];
        const dayWrapper = document.createElement('div');
        dayWrapper.className = 'day-slot bg-white rounded-xl p-3 border-2 border-transparent transition-colors min-h-[250px] shadow-sm flex flex-col';
        const formattedDate = dayDate.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' });
        dayWrapper.innerHTML = `<div class="text-center pb-2 mb-2 border-b border-slate-200"><p class="font-bold text-slate-700">${formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1)}</p></div><div class="lessons-container flex-grow" data-date="${dateString}"></div>`;
        timelineContainer.appendChild(dayWrapper);
    }

    timelineEvents.forEach(event => {
        const lesson = lessonsData.find(l => l.id === event.lessonId);
        if (lesson) {
            const container = timelineContainer.querySelector(`.lessons-container[data-date="${event.scheduledDate}"]`);
            if (container) {
                const lessonEl = createTimelineLessonElement(lesson, event.id);
                const existingLessons = Array.from(container.children);
                const insertBefore = existingLessons.find(el => parseInt(el.dataset.orderIndex) > event.orderIndex);
                if (insertBefore) {
                    container.insertBefore(lessonEl, insertBefore);
                } else {
                    container.appendChild(lessonEl);
                }
            }
        }
    });

    initializeTimelineSortable();
}

function createTimelineLessonElement(lesson, eventId) {
    const el = document.createElement('div');
    el.className = 'lesson-bubble bg-green-100 text-green-800 p-3 m-1 rounded-lg shadow-sm flex items-center justify-between border border-green-200';
    el.dataset.lessonId = lesson.id;
    el.dataset.eventId = eventId;
    el.innerHTML = `
        <div class="flex items-center space-x-3 flex-grow">
            <span class="text-xl">${lesson.icon}</span>
            <span class="font-semibold text-sm">${lesson.title}</span>
        </div>
        <button class="delete-event-btn p-1 rounded-full hover:bg-red-200 text-slate-400 hover:text-red-600 transition-colors" title="Odebrat z plánu">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>`;
    el.querySelector('.delete-event-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Opravdu chcete odebrat tuto lekci z plánu?')) {
            try {
                await deleteDoc(doc(db, 'timeline_events', el.dataset.eventId));
                el.remove();
                showToast("Lekce byla odebrána z plánu.");
            } catch (error) {
                console.error("Error deleting timeline event:", error);
                showToast("Chyba při odstraňování události.", true);
            }
        }
    });
    return el;
}

function initializeTimelineSortable() {
    const containers = document.querySelectorAll('#timeline-container .lessons-container');
    const updateFirestoreOrder = async (container) => {
        const batch = writeBatch(db);
        Array.from(container.children).forEach((child, i) => {
            if (child.dataset.eventId) {
                batch.update(doc(db, 'timeline_events', child.dataset.eventId), { orderIndex: i });
            }
        });
        await batch.commit().catch(e => console.error("Order update failed:", e));
    };

    containers.forEach(container => {
        new Sortable(container, {
            group: { name: 'timeline-events', put: ['lesson-status'] },
            animation: 150,
            ghostClass: 'blue-background-class',
            dragClass: 'dragging',
            onAdd: async (evt) => {
                if (evt.from.classList.contains('lesson-group')) {
                    evt.item.remove();
                    try {
                        await addDoc(collection(db, 'timeline_events'), {
                            lessonId: evt.item.dataset.id,
                            courseId: 'default-course',
                            scheduledDate: evt.to.dataset.date,
                            orderIndex: evt.newDraggableIndex,
                            createdAt: serverTimestamp()
                        });
                        showToast("Lekce byla naplánována.");
                        renderTimeline(document.getElementById('main-content-area'));
                        renderLessonLibrary(document.getElementById('professor-sidebar'));
                    } catch (error) {
                        console.error("Error creating timeline event:", error);
                        showToast("Nepodařilo se naplánovat lekci.", true);
                    }
                } else if (evt.item.dataset.eventId) {
                    await updateDoc(doc(db, 'timeline_events', evt.item.dataset.eventId), { scheduledDate: evt.to.dataset.date });
                    updateFirestoreOrder(evt.from);
                    updateFirestoreOrder(evt.to);
                }
            },
            onUpdate: (evt) => updateFirestoreOrder(evt.from)
        });
    });
}

function renderEditorMenu(container) {
    if (!container) return;
    container.innerHTML = `
        <header class="p-4 border-b border-slate-200 flex-shrink-0">
            <button id="back-to-timeline-btn" class="flex items-center text-sm text-green-700 hover:underline mb-3">&larr; Zpět na plán výuky</button>
            <div class="flex items-center space-x-3">
                <span class="text-3xl">${currentLesson ? currentLesson.icon : '🆕'}</span>
                <h2 id="editor-lesson-title" class="text-xl font-bold truncate text-slate-800">${currentLesson ? currentLesson.title : 'Vytvořit novou lekci'}</h2>
            </div>
        </header>
        <div class="flex-grow overflow-y-auto p-2"><nav id="editor-vertical-menu" class="flex flex-col space-y-1"></nav></div>`;

    container.querySelector('#back-to-timeline-btn').addEventListener('click', () => showProfessorContent('timeline'));

    const menuEl = container.querySelector('#editor-vertical-menu');
    const menuItems = [
        { id: 'details', label: 'Detaily lekce', icon: '📝' },
        { id: 'docs', label: 'Dokumenty k lekci', icon: '📁' },
        { id: 'text', label: 'Text pro studenty', icon: '✍️' },
        { id: 'presentation', label: 'Prezentace', icon: '🖼️' },
        { id: 'video', label: 'Video', icon: '▶️' },
        { id: 'quiz', label: 'Kvíz', icon: '❓' },
        { id: 'test', label: 'Test', icon: '✅' },
        { id: 'post', label: 'Podcast & Materiály', icon: '🎙️' },
    ];

    menuEl.innerHTML = menuItems.map(item => `<a href="#" data-view="${item.id}" class="editor-menu-item flex items-center p-3 text-sm font-medium rounded-md hover:bg-slate-100 transition-colors">${item.icon}<span class="ml-3">${item.label}</span></a>`).join('');

    menuEl.querySelectorAll('.editor-menu-item').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            menuEl.querySelectorAll('.editor-menu-item').forEach(i => i.classList.remove('bg-green-100', 'text-green-800', 'font-semibold'));
            item.classList.add('bg-green-100', 'text-green-800', 'font-semibold');
            showEditorContent(item.dataset.view);
        });
    });
    menuEl.querySelector('.editor-menu-item').click();
}

async function showEditorContent(viewId) {
    const mainArea = document.getElementById('main-content-area');
    if (!mainArea) return;
    mainArea.innerHTML = `<div class="p-4 sm:p-6 md:p-8 overflow-y-auto h-full view-transition" id="editor-content-container"></div>`;
    const container = document.getElementById('editor-content-container');
    let contentHTML = '';
    const lessonId = currentLesson ? currentLesson.id : null;

    const renderWrapper = (title, content) => `<h2 class="text-3xl font-extrabold text-slate-800 mb-6">${title}</h2><div class="bg-white p-6 rounded-2xl shadow-lg">${content}</div>`;

    switch(viewId) {
        case 'details':
            contentHTML = renderWrapper('Detaily lekce', `
                <div id="lesson-details-form" class="space-y-4">
                    <div><label class="block font-medium text-slate-600">Název lekce</label><input type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="${currentLesson?.title || ''}" placeholder="Např. Úvod do organické chemie"></div>
                    <div><label class="block font-medium text-slate-600">Podtitulek</label><input type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="${currentLesson?.subtitle || ''}" placeholder="Základní pojmy a principy"></div>
                    <div class="grid grid-cols-2 gap-4">
                        <div><label class="block font-medium text-slate-600">Číslo lekce</label><input type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="${currentLesson?.number || ''}" placeholder="Např. 101"></div>
                        <div><label class="block font-medium text-slate-600">Datum vytvoření</label><input type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1 bg-slate-100" value="${currentLesson ? new Date(currentLesson.creationDate).toLocaleDateString('cs-CZ') : new Date().toLocaleDateString('cs-CZ')}" disabled></div>
                    </div>
                    <div class="text-right pt-4"><button id="save-lesson-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800">Uložit změny</button></div>
                </div>`);
            break;
        case 'docs':
            contentHTML = renderWrapper('Dokumenty k lekci', `
                <p class="text-slate-500 mb-4">Nahrajte specifické soubory pro tuto lekci.</p>
                <div id="upload-zone" class="upload-zone rounded-lg p-10 text-center"><p>Přetáhněte soubory sem nebo klikněte</p></div>
                <input type="file" id="file-upload-input" multiple class="hidden">
                <div id="upload-progress" class="mt-4 space-y-2"></div>
                <h3 class="font-bold text-slate-700 mt-6 mb-2">Nahrané soubory:</h3>
                <ul id="documents-list" class="space-y-2"><li>Načítám...</li></ul>`);
            break;
        case 'text':
            contentHTML = renderWrapper('Text pro studenty', `
                <p class="text-slate-500 mb-4">Zadejte AI prompt a vygenerujte hlavní studijní text.</p>
                ${await createDocumentSelector(lessonId)}
                <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder="Např. 'Vytvoř poutavý úvodní text...'"></textarea>
                <div class="flex items-center justify-between mt-4">
                    <select id="length-select" class="rounded-lg border-slate-300"><option>Krátký</option><option selected>Střední</option><option>Dlouhý</option></select>
                    <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg">✨ Generovat text</button>
                </div>
                <div id="generation-output" class="mt-6 border-t pt-6">...</div>
                <div class="text-right mt-4"><button id="save-content-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hidden">Uložit do lekce</button></div>`);
            break;
        case 'video':
            contentHTML = renderWrapper('Vložení videa', `
                <p class="text-slate-500 mb-4">Vložte odkaz na video z YouTube.</p>
                <div><label class="block font-medium text-slate-600">YouTube URL</label><input id="youtube-url" type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1" placeholder="https://www.youtube.com/watch?v=..."></div>
                <div id="youtube-url-error" class="text-red-500 text-sm mt-1 hidden"></div>
                <div class="text-right pt-4"><button id="embed-video-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg">Vložit video</button></div>
                <div id="video-preview" class="mt-6 border-t pt-6">...</div>`);
            break;
        default:
            contentHTML = renderWrapper(viewId, `<div class="text-center p-8">Tato sekce se připravuje.</div>`);
    }

    container.innerHTML = contentHTML;

    // Attach event listeners after rendering
    if (viewId === 'details') {
        document.getElementById('save-lesson-btn').addEventListener('click', handleSaveLesson);
    } else if (viewId === 'docs') {
        initializeUpload(currentLesson);
    } else if (viewId === 'video') {
        document.getElementById('embed-video-btn').addEventListener('click', handleEmbedVideo);
    } else if (document.getElementById('generate-btn')) {
        document.getElementById('generate-btn').addEventListener('click', () => handleGenerateContent(viewId));
    }
}

function handleEmbedVideo() {
    const urlInput = document.getElementById('youtube-url');
    const errorEl = document.getElementById('youtube-url-error');
    const previewEl = document.getElementById('video-preview');
    const url = urlInput.value.trim();

    // Simple regex for YouTube URL validation
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;

    if (!url || !youtubeRegex.test(url)) {
        errorEl.textContent = 'Prosím, zadejte platnou YouTube URL.';
        errorEl.classList.remove('hidden');
        previewEl.innerHTML = '';
        return;
    }

    errorEl.classList.add('hidden');
    let videoId;
    if (url.includes('youtu.be')) {
        videoId = new URL(url).pathname.slice(1);
    } else {
        const urlParams = new URLSearchParams(new URL(url).search);
        videoId = urlParams.get('v');
    }

    if (videoId) {
        previewEl.innerHTML = `<div class="rounded-xl overflow-hidden aspect-video mx-auto max-w-2xl shadow-lg"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen class="w-full h-full"></iframe></div>`;
        // Here you would also save the URL to Firestore
        if (currentLesson && currentLesson.id) {
            updateDoc(doc(db, 'lessons', currentLesson.id), { videoUrl: url })
                .then(() => showToast('Video bylo úspěšně uloženo.'))
                .catch(e => {
                    showToast('Chyba při ukládání videa.', true);
                    console.error("Error saving video URL:", e);
                });
        }
    } else {
        errorEl.textContent = 'Nepodařilo se extrahovat video ID z URL.';
        errorEl.classList.remove('hidden');
        previewEl.innerHTML = '';
    }
}

async function handleSaveLesson() {
    const form = document.getElementById('lesson-details-form');
    const title = form.querySelector('input[placeholder="Např. Úvod do organické chemie"]').value;
    const subtitle = form.querySelector('input[placeholder="Základní pojmy a principy"]').value;
    const number = form.querySelector('input[placeholder="Např. 101"]').value;

    if (!title || !subtitle || !number) {
        showToast('Vyplňte prosím všechna pole.', true);
        return;
    }

    const lessonData = {
        title,
        subtitle,
        number,
        status: currentLesson?.status || 'Naplánováno',
        icon: currentLesson?.icon || '🆕',
        content: currentLesson?.content || '',
    };

    try {
        if (currentLesson && currentLesson.id) {
            await updateDoc(doc(db, 'lessons', currentLesson.id), lessonData);
            showToast('Lekce byla aktualizována.');
        } else {
            const newDoc = await addDoc(collection(db, 'lessons'), {
                ...lessonData,
                creationDate: new Date().toISOString().split('T')[0],
                createdAt: serverTimestamp()
            });
            currentLesson = { id: newDoc.id, ...lessonData }; // Update current lesson state
            showToast('Lekce byla vytvořena.');
        }
        initProfessorDashboard(); // Refresh UI
    } catch (error) {
        console.error("Chyba při ukládání lekce:", error);
        showToast("Při ukládání lekce došlo k chybě.", true);
    }
}

async function handleDeleteLesson(lessonId, deleteBtn) {
    if (confirm('Opravdu chcete smazat tuto lekci?')) {
        deleteBtn.disabled = true;
        try {
            await deleteDoc(doc(db, 'lessons', lessonId));
            showToast('Lekce byla smazána.');
            initProfessorDashboard(); // Refresh UI
        } catch (error) {
            console.error("Chyba při mazání lekce:", error);
            showToast("Při mazání lekce došlo k chybě.", true);
            deleteBtn.disabled = false;
        }
    }
}

async function handleGenerateContent(viewId) {
    // This is a simplified placeholder for the generation logic.
    // The full implementation would be similar to the original main.js
    const outputEl = document.getElementById('generation-output');
    const promptInput = document.getElementById('prompt-input');
    const userPrompt = promptInput ? promptInput.value.trim() : '';

    if (promptInput && !userPrompt) {
        outputEl.innerHTML = `<div class="p-4 bg-red-100">Zadejte prosím prompt.</div>`;
        return;
    }

    outputEl.innerHTML = `Generuji obsah pro '${viewId}'...`;
    // Placeholder for API call
    setTimeout(() => {
        outputEl.innerHTML = `Vygenerovaný obsah pro '${viewId}' na základě promptu: "${userPrompt}"`;
        const saveBtn = document.getElementById('save-content-btn');
        if (saveBtn) saveBtn.classList.remove('hidden');
    }, 1000);
}

async function createDocumentSelector(lessonId) {
    if (!lessonId) {
        return `<div class="mb-4 p-3 bg-slate-100">Uložte lekci pro nahrávání dokumentů.</div>`;
    }
    const documentsCollectionRef = collection(db, 'lessons', lessonId, 'documents');
    try {
        const querySnapshot = await getDocs(documentsCollectionRef);
        if (querySnapshot.empty) {
            return `<div class="mb-4 p-3 bg-yellow-100">Pro RAG nahrajte dokumenty.</div>`;
        }
        const options = querySnapshot.docs.map(doc => `<option value="${doc.data().storagePath}">${doc.data().fileName}</option>`).join('');
        return `<div class="mb-4"><label for="document-select" class="block">Vyberte kontextový dokument (RAG):</label><select id="document-select" class="w-full p-2 mt-1">${options}</select></div>`;
    } catch (error) {
        console.error("Chyba při načítání dokumentů:", error);
        return `<div class="mb-4 p-3 bg-red-100">Nepodařilo se načíst dokumenty.</div>`;
    }
}

async function renderTelegramInteractionView(courseId) {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    roleContentWrapper.innerHTML = `
        <div id="telegram-interaction-view" class="w-full p-4 sm:p-6 md:p-8 bg-slate-50 h-screen overflow-y-auto">
            <header class="flex items-center justify-between mb-6">
                <div>
                    <h1 class="text-3xl font-extrabold text-slate-800">Interakce se studenty</h1>
                </div>
                <button id="back-to-timeline-from-interactions" class="text-sm font-semibold text-green-700 hover:underline">&larr; Zpět</button>
            </header>
            <div id="student-telegram-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                Načítám studenty...
            </div>
        </div>
    `;

    document.getElementById('back-to-timeline-from-interactions').addEventListener('click', () => {
        initProfessorDashboard();
    });

    const listContainer = document.getElementById('student-telegram-list');
    try {
        const students = (await getDocs(collection(db, 'students'))).docs.map(d => ({ id: d.id, ...d.data() }));
        const connected = students.filter(s => s.telegramChatId);

        if (connected.length === 0) {
            listContainer.innerHTML = `Žádný student není připojen přes Telegram.`;
            return;
        }

        listContainer.innerHTML = connected.map(student => `
            <div class="bg-white rounded-2xl shadow-lg p-6 flex flex-col" data-student-id="${student.id}">
                <p class="font-semibold">${student.email}</p>
                <textarea class="message-input w-full border-slate-300 rounded-lg p-2 h-28 mt-2" placeholder="Napište zprávu..."></textarea>
                <button class="send-telegram-btn mt-4 w-full px-4 py-2 bg-sky-500 text-white rounded-lg">Odeslat</button>
            </div>
        `).join('');

        document.querySelectorAll('.send-telegram-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const card = e.target.closest('[data-student-id]');
                const studentId = card.dataset.studentId;
                const text = card.querySelector('.message-input').value.trim();
                if (!text) return;
                try {
                    await sendMessageToStudent({ studentId, text });
                    showToast("Zpráva odeslána.");
                    card.querySelector('.message-input').value = '';
                } catch (error) {
                    showToast(`Odeslání selhalo: ${error.message}`, true);
                }
            });
        });
    } catch (error) {
        listContainer.innerHTML = 'Nepodařilo se načíst studenty.';
    }
}

function renderAnalytics(container) {
    if (!container) return;
    container.innerHTML = `<div class="p-8"><h1 class="text-2xl">Analýza studentů</h1><p>Tato sekce se připravuje.</p></div>`;
}