import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
import { db } from './firebase-init.js';
import { renderEditorMenu } from './editor-handler.js';

let lessonsData = [];
let timelineEvents = [];

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
            <li><button data-view="timeline" class="nav-item p-3 rounded-lg flex items-center justify-center text-white bg-green-700" title="Plán výuky"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button></li>
            <li><button data-view="media" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white" title="Knihovna médií"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></button></li>
            <li><button data-view="interactions" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white" title="Interakce se studenty"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button></li>
            <li><button data-view="analytics" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white" title="Analýza studentů"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 2v6h6M2.66 15.57a10 10 0 1 0 .57-8.38"/><path d="M12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"/><path d="M12 12v5"/><path d="M12 7h.01"/></svg></button></li>
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

function renderPlaceholder(container, title) {
    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white">
            <h1 class="text-3xl font-extrabold text-slate-800">${title}</h1>
            <p class="text-slate-500 mt-1">Tato funkce bude brzy implementována.</p>
        </header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6">
            <div class="p-4 min-h-[400px] bg-slate-200/50 rounded-lg border-2 border-dashed flex items-center justify-center">
                <span class="text-slate-500">Obsah se připravuje...</span>
            </div>
        </div>`;
}

async function showProfessorContent(view, lesson = null) {
    const dashboardView = document.getElementById('dashboard-professor');
    if (!dashboardView) return;

    dashboardView.classList.remove('hidden');

    const sidebar = document.getElementById('professor-sidebar');
    const mainArea = document.getElementById('main-content-area');

    // Always show the lesson library in the sidebar for timeline-related views
    if (['timeline', 'editor'].includes(view)) {
        if (!lessonsData || lessonsData.length === 0) await fetchLessons();
        renderLessonLibrary(sidebar);
    } else {
        sidebar.innerHTML = ''; // Clear sidebar for other views
    }

    if (view === 'editor') {
        renderEditorMenu(sidebar, lesson); // Re-renders sidebar specifically for editor
    } else if (view === 'timeline') {
        renderTimeline(mainArea);
    } else if (view === 'media') {
        renderPlaceholder(mainArea, 'Knihovna médií');
    } else if (view === 'interactions') {
        renderPlaceholder(mainArea, 'Interakce se studenty');
    } else if (view === 'analytics') {
        renderPlaceholder(mainArea, 'Analýza studentů');
    }
}

async function fetchTimelineEvents() {
    try {
        const timelineCollection = collection(db, 'timeline_events');
        const q = query(timelineCollection, orderBy('scheduledDate', 'asc'));
        const querySnapshot = await getDocs(q);
        timelineEvents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return true;
    } catch (error) {
        console.error("Error fetching timeline events: ", error);
        showToast("Nepodařilo se načíst události z časové osy.", true);
        return false;
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

    new Sortable(container.querySelector('#lesson-list-container'), {
        group: {
            name: 'lessons',
            pull: 'clone',
            put: false
        },
        animation: 150,
        sort: false
    });

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
        await fetchLessons(); // Refresh lesson data
        renderLessonLibrary(container); // Re-render the library
        showProfessorContent('editor', { id: docRef.id, ...newLessonData });
    });
}

function renderScheduledEvent(event) {
    const lesson = lessonsData.find(l => l.id === event.lessonId);
    if (!lesson) return '';
    return `
        <div class="scheduled-lesson p-4 mb-2 bg-white rounded-lg shadow" data-event-id="${event.id}" data-lesson-id="${event.lessonId}">
            <h3 class="font-semibold text-slate-800">${lesson.title}</h3>
            <p class="text-sm text-slate-500">${lesson.subtitle}</p>
            <div class="text-xs text-slate-400 mt-2">Naplánováno: ${new Date(event.scheduledDate.toDate()).toLocaleDateString()}</div>
             <button class="delete-event-btn absolute top-2 right-2 text-red-500 hover:text-red-700">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                    <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                </svg>
            </button>
        </div>`;
}

async function renderTimeline(container) {
    await fetchTimelineEvents();
    const eventsHtml = timelineEvents.map(renderScheduledEvent).join('');

    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white">
            <h1 class="text-3xl font-extrabold text-slate-800">Plán výuky</h1>
            <p class="text-slate-500 mt-1">Naplánujte lekce přetažením z knihovny vlevo.</p>
        </header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6">
            <div id="timeline-dropzone" class="p-4 min-h-[400px] bg-slate-200/50 rounded-lg border-2 border-dashed">
                ${eventsHtml || '<span class="text-slate-500">Zde přetáhněte lekce...</span>'}
            </div>
        </div>`;

    const dropzone = container.querySelector('#timeline-dropzone');
    new Sortable(dropzone, {
        group: 'lessons',
        animation: 150,
        onAdd: async (evt) => {
            const lessonId = evt.item.dataset.lessonId;
            const newIndex = evt.newDraggableIndex;
            try {
                // Create a placeholder date; could be replaced with a date picker
                const scheduledDate = serverTimestamp();
                const docRef = await addDoc(collection(db, 'timeline_events'), {
                    lessonId,
                    scheduledDate,
                    order: newIndex
                });
                evt.item.dataset.eventId = docRef.id; // Store event id on the element
                showToast('Lekce byla naplánována.', false);
                await renderTimeline(container); // Re-render to get all data correct
            } catch (error) {
                console.error("Error adding timeline event: ", error);
                showToast('Chyba při plánování lekce.', true);
                evt.item.remove(); // Remove item if DB operation fails
            }
        },
        onUpdate: async (evt) => {
            const items = Array.from(evt.to.children);
            const batch = writeBatch(db);
            items.forEach((item, index) => {
                const eventId = item.dataset.eventId;
                if (eventId) {
                    const eventRef = doc(db, 'timeline_events', eventId);
                    batch.update(eventRef, { order: index });
                }
            });
            try {
                await batch.commit();
                showToast('Pořadí bylo aktualizováno.', false);
            } catch (error) {
                console.error("Error updating timeline order: ", error);
                showToast('Chyba při aktualizaci pořadí.', true);
            }
        }
    });

    container.querySelectorAll('.delete-event-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const eventElement = e.currentTarget.closest('.scheduled-lesson');
            const eventId = eventElement.dataset.eventId;
            if (confirm('Opravdu chcete odstranit tuto naplánovanou lekci?')) {
                try {
                    await deleteDoc(doc(db, 'timeline_events', eventId));
                    eventElement.remove();
                    showToast('Naplánovaná lekce byla odstraněna.', false);
                } catch (error) {
                    console.error("Error deleting timeline event: ", error);
                    showToast('Chyba při odstraňování lekce.', true);
                }
            }
        });
    });
}