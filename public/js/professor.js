import { collection, getDocs, getDoc, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { initializeUpload, initializeCourseMediaUpload, renderMediaLibraryFiles } from './upload-handler.js';
import { showToast } from './utils.js';
import { db } from './firebase-init.js';
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
    showProfessorContent('timeline'); // Default to timeline view, as it's the main hub
}

function setupProfessorNav() {
    const nav = document.getElementById('main-nav');
    if (nav) {
        nav.innerHTML = `
            <li><button data-view="timeline" class="nav-item p-3 rounded-lg flex items-center justify-center text-white bg-green-700" title="Plán výuky"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button></li>
        `; // Add other nav items here if needed

        nav.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                showProfessorContent(view);
                nav.querySelectorAll('.nav-item').forEach(b => {
                    b.classList.remove('bg-green-700', 'text-white');
                    b.classList.add('text-green-200', 'hover:bg-green-700');
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
    const mainArea = document.getElementById('main-content-area');

    if (view === 'editor') {
        currentLesson = lesson;
        initializeEditor(currentLesson);
        renderEditorMenu(sidebar);
        showEditorContent('details'); // Always start with details view
    } else { // Default to timeline/library view
        await fetchLessons(); // Refresh lessons data
        renderLessonLibrary(sidebar);
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
        const newLessonData = { title: 'Nová lekce', subtitle: 'Krátký popis', icon: '🆕', content: '', status: 'Naplánováno', creationDate: new Date().toISOString() };
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
            <div id="timeline-dropzone" class="p-4 min-h-[400px] bg-white rounded-lg border-2 border-dashed"></div>
        </div>`;

    const dropzone = container.querySelector('#timeline-dropzone');
    
    // Fetch existing timeline events
    const eventsCollection = collection(db, 'timeline_events');
    const q = query(eventsCollection, orderBy("scheduledDate"), orderBy("orderIndex"));
    const querySnapshot = await getDocs(q);
    const timelineEvents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    dropzone.innerHTML = timelineEvents.map(renderScheduledEvent).join('');
    
    // Initialize SortableJS
    new Sortable(dropzone, {
        group: 'lessons',
        animation: 150,
        ghostClass: 'blue-background-class',
        onAdd: async (evt) => {
            const lessonId = evt.item.dataset.lessonId;
            const lesson = lessonsData.find(l => l.id === lessonId);
            if (!lesson) return;

            // This is a placeholder for actual date selection
            const scheduledDate = new Date().toISOString().split('T')[0];

            const newEvent = {
                lessonId: lesson.id,
                title: lesson.title,
                icon: lesson.icon,
                scheduledDate: scheduledDate,
                orderIndex: evt.newIndex,
                createdAt: serverTimestamp()
            };

            try {
                const docRef = await addDoc(collection(db, 'timeline_events'), newEvent);
                evt.item.dataset.eventId = docRef.id; // Add event id to the element
                showToast("Lekce naplánována.");
            } catch (error) {
                console.error("Error scheduling lesson:", error);
                showToast("Chyba při plánování lekce.", true);
                evt.item.remove(); // Remove element if DB operation fails
            }
        }
    });

    // Add delete functionality to existing events
    dropzone.querySelectorAll('.delete-event-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const eventElement = e.target.closest('.lesson-bubble');
            handleDeleteEvent(e, eventElement);
        });
    });
}

function renderScheduledEvent(event) {
    const lesson = lessonsData.find(l => l.id === event.lessonId);
    if (!lesson) return '';

    // THIS IS THE FIX FOR THE DATE ERROR
    const scheduledDate = new Date(event.scheduledDate); 

    const isPast = scheduledDate < new Date();
    const dateString = scheduledDate.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
    
    return `
    <div class="lesson-bubble p-3 m-1 rounded-lg shadow-sm flex items-center justify-between border ${isPast ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-green-100 text-green-800 border-green-200'}" data-lesson-id="${lesson.id}" data-event-id="${event.id}" data-order-index="${event.orderIndex}">
        <div class="flex items-center space-x-3 flex-grow cursor-grab">
            <span class="font-mono text-xs text-slate-400">${dateString}</span>
            <span class="text-xl">${lesson.icon}</span>
            <span class="font-semibold text-sm">${lesson.title}</span>
        </div>
        <button class="delete-event-btn p-1 rounded-full hover:bg-red-200 text-slate-400 hover:text-red-600 transition-colors" title="Odebrat z plánu">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    </div>`;
}

async function handleDeleteEvent(e, eventElement) {
    e.stopPropagation();
    const eventId = eventElement.dataset.eventId;
    if (confirm('Opravdu chcete odebrat tuto lekci z plánu?')) {
        try {
            await deleteDoc(doc(db, 'timeline_events', eventId));
            eventElement.remove();
            showToast("Lekce byla odebrána z plánu.");
        } catch (error) {
            console.error("Error deleting timeline event:", error);
            showToast("Chyba při odstraňování události.", true);
        }
    }
}

function renderEditorMenu(container) {
    container.innerHTML = `
        <div class="p-4 border-b flex items-center justify-between">
            <button id="back-to-timeline-btn" class="text-green-700 hover:underline">&larr; Zpět na plánovač</button>
            <h2 class="text-xl font-bold truncate">${currentLesson?.title || 'Nová lekce'}</h2>
        </div>
        <div class="flex-grow p-4 overflow-y-auto">
            <ul id="editor-nav" class="space-y-2">
                <li><button data-view="details" class="editor-nav-item w-full text-left p-3 rounded-lg bg-green-100 font-semibold">Detaily lekce</button></li>
                <li><button data-view="text" class="editor-nav-item w-full text-left p-3 rounded-lg">Hlavní text</button></li>
                <li><button data-view="files" class="editor-nav-item w-full text-left p-3 rounded-lg">Soubory</button></li>
                <li><button data-view="quiz" class="editor-nav-item w-full text-left p-3 rounded-lg">Kvíz</button></li>
            </ul>
        </div>
    `;

    container.querySelector('#back-to-timeline-btn').addEventListener('click', () => {
        showProfessorContent('timeline');
    });

    container.querySelectorAll('.editor-nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const viewId = e.currentTarget.dataset.view;
            showEditorContent(viewId);
            container.querySelectorAll('.editor-nav-item').forEach(b => b.classList.remove('bg-green-100', 'font-semibold'));
            e.currentTarget.classList.add('bg-green-100', 'font-semibold');
        });
    });
}

function showEditorContent(viewId) {
    const mainArea = document.getElementById('main-content-area');
    mainArea.innerHTML = `<div class="p-8 overflow-y-auto">${getEditorContent(viewId)}</div>`;
    attachEditorEventListeners(viewId);
    if (viewId === 'files') {
        initializeUpload(currentLesson);
    }
}
