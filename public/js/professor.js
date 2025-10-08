import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { renderEditorMenu } from './editor-handler.js';
import { showToast } from './utils.js';
import { db } from './firebase-init.js';

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
        <div id="dashboard-professor" class="w-full flex main-view active h-screen">
            <aside id="professor-sidebar" class="w-full md:w-96 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 h-full"></aside>
            <main id="main-content-area" class="flex-grow bg-slate-50 flex flex-col h-screen"></main>
        </div>
    `;
    setupProfessorNav();
    showProfessorContent('timeline');
}

function setupProfessorNav() {
    const nav = document.getElementById('main-nav');
    if (nav) {
        nav.innerHTML = `
            <li><button data-view="timeline" class="nav-item p-3 rounded-lg flex items-center justify-center text-white bg-green-700" title="Plán výuky"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button></li>
        `;

        nav.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                nav.querySelectorAll('.nav-item').forEach(b => b.classList.remove('bg-green-700'));
                e.currentTarget.classList.add('bg-green-700');
                showProfessorContent(view);
            });
        });
    }
}

async function showProfessorContent(view, lesson = null) {
    const sidebar = document.getElementById('professor-sidebar');
    const mainArea = document.getElementById('main-content-area');

    if (view === 'editor') {
        // renderEditorMenu sa už postará o zobrazenie menu aj prvého pohľadu editora ('details')
        renderEditorMenu(sidebar, lesson);
    } else {
        await fetchLessons();
        renderLessonLibrary(sidebar);
        renderTimeline(mainArea);
    }
}

function renderLessonLibrary(container) {
    const sortedLessons = [...lessonsData].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    const lessonsHtml = sortedLessons.map(lesson => `
        <div class="lesson-bubble-in-library p-4 mb-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-green-100" data-lesson-id="${lesson.id}">
            <h3 class="font-semibold text-slate-800">${lesson.title}</h3>
            <p class="text-sm text-slate-500">${lesson.subtitle}</p>
        </div>
    `).join('');

    container.innerHTML = `
        <header class="p-4 border-b border-slate-200 flex-shrink-0">
            <h2 class="text-xl font-bold text-slate-800">Knihovna lekcí</h2>
        </header>
        <div class="flex-grow overflow-y-auto p-4" id="lesson-list-container">
            ${lessonsHtml}
        </div>
        <footer class="p-4 border-t border-slate-200 flex-shrink-0">
            <button id="add-new-lesson-btn" class="w-full p-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800">Přidat novou lekci</button>
        </footer>
    `;

    container.querySelectorAll('.lesson-bubble-in-library').forEach(el => {
        el.addEventListener('click', () => {
            const lessonId = el.dataset.lessonId;
            const selectedLesson = lessonsData.find(l => l.id === lessonId);
            showProfessorContent('editor', selectedLesson);
        });
    });
    
    container.querySelector('#add-new-lesson-btn').addEventListener('click', () => {
        showProfessorContent('editor', null);
    });

    const listEl = container.querySelector('#lesson-list-container');
    if (listEl) {
        new Sortable(listEl, {
            group: { name: 'lessons', pull: 'clone', put: false },
            animation: 150,
            sort: false,
        });
    }
}

async function renderTimeline(container) {
    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white">
            <h1 class="text-3xl font-extrabold text-slate-800">Plán výuky</h1>
            <p class="text-slate-500 mt-1">Naplánujte lekce přetažením z knihovny vlevo.</p>
        </header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6">
            <div id="timeline-dropzone" class="p-4 min-h-[400px] bg-white rounded-lg border-2 border-dashed border-slate-300 space-y-2"></div>
        </div>`;

    const dropzone = container.querySelector('#timeline-dropzone');
    
    const eventsCollection = collection(db, 'timeline_events');
    const q = query(eventsCollection, orderBy("orderIndex"));
    const querySnapshot = await getDocs(q);
    const timelineEvents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    dropzone.innerHTML = timelineEvents.map(renderScheduledEvent).join('');
    
    attachDeleteListeners(dropzone);

    new Sortable(dropzone, {
        group: 'lessons',
        animation: 150,
        handle: '.handle',
        ghostClass: 'opacity-50',
        onAdd: async (evt) => {
            const lessonId = evt.item.dataset.lessonId;
            const lesson = lessonsData.find(l => l.id === lessonId);
            const tempEl = evt.item;
            tempEl.innerHTML = `<div class="p-3">Načítám...</div>`;

            const scheduledDate = new Date().toISOString().split('T')[0];

            const newEventData = {
                lessonId: lesson.id,
                scheduledDate: scheduledDate,
                orderIndex: evt.newIndex,
                createdAt: serverTimestamp()
            };

            try {
                const docRef = await addDoc(collection(db, 'timeline_events'), newEventData);
                const newEvent = { id: docRef.id, ...newEventData };
                
                const newElement = document.createElement('div');
                newElement.innerHTML = renderScheduledEvent(newEvent);
                
                tempEl.replaceWith(newElement.firstChild);
                await updateAllOrderIndexes(dropzone);
                attachDeleteListeners(dropzone);
                showToast("Lekce naplánována.");
            } catch (error) {
                console.error("Error scheduling lesson:", error);
                showToast("Chyba při plánování lekce.", true);
                tempEl.remove();
            }
        },
        onUpdate: async (evt) => {
            await updateAllOrderIndexes(evt.to);
        }
    });
}

function renderScheduledEvent(event) {
    const lesson = lessonsData.find(l => l.id === event.lessonId);
    if (!lesson) return '';

    const scheduledDate = new Date(event.scheduledDate);
    const isPast = new Date(scheduledDate.toDateString()) < new Date(new Date().toDateString());
    const dateString = scheduledDate.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' });
    
    return `
    <div class="lesson-bubble p-3 rounded-lg shadow-sm flex items-center justify-between border ${isPast ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-green-50 text-green-800 border-green-200'}" data-event-id="${event.id}">
        <div class="flex items-center space-x-3 flex-grow">
            <span class="handle cursor-grab text-slate-400 hover:text-slate-600"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></span>
            <span class="font-mono text-xs text-slate-500">${dateString}</span>
            <span class="text-xl">${lesson.icon}</span>
            <span class="font-semibold text-sm">${lesson.title}</span>
        </div>
        <button class="delete-event-btn p-1 rounded-full hover:bg-red-200 text-slate-400 hover:text-red-600 transition-colors" title="Odebrat z plánu">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
    </div>`;
}

async function updateAllOrderIndexes(container) {
    const items = container.querySelectorAll('.lesson-bubble');
    const batch = writeBatch(db);
    
    items.forEach((item, index) => {
        const eventId = item.dataset.eventId;
        if (eventId) {
            const docRef = doc(db, 'timeline_events', eventId);
            batch.update(docRef, { orderIndex: index });
        }
    });

    try {
        await batch.commit();
        console.log("Order indexes updated.");
    } catch (error) {
        console.error("Error updating order indexes:", error);
        showToast("Nepodařilo se uložit nové pořadí.", true);
    }
}

function attachDeleteListeners(container) {
    container.querySelectorAll('.delete-event-btn').forEach(btn => {
        btn.replaceWith(btn.cloneNode(true));
    });
    container.querySelectorAll('.delete-event-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const eventElement = e.target.closest('.lesson-bubble');
            const eventId = eventElement.dataset.eventId;
            if (confirm('Opravdu chcete odebrat tuto lekci z plánu?')) {
                try {
                    await deleteDoc(doc(db, 'timeline_events', eventId));
                    eventElement.remove();
                    await updateAllOrderIndexes(container);
                    showToast("Lekce byla odebrána z plánu.");
                } catch (error) {
                    console.error("Error deleting timeline event:", error);
                    showToast("Chyba při odstraňování události.", true);
                }
            }
        });
    });
}
