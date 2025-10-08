// --- ALL IMPORTS MUST BE AT THE TOP ---
import { collection, getDocs, getDoc, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, setDoc, writeBatch, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { initializeUpload, initializeCourseMediaUpload, renderMediaLibraryFiles } from './upload-handler.js';
import { db, functions } from './firebase-init.js';
import { showToast } from './utils.js';
import { showEditorContent, renderEditorMenu } from './editor-handler.js';


// --- APP STATE ---
let lessonsData = [];
let currentLesson = null;
let currentUserRole = 'professor'; // Hardcoded for this module

// --- CALLABLE FUNCTIONS INITIALIZATION ---
const sendMessageToStudent = httpsCallable(functions, 'sendMessageToStudent');


// --- DATA FETCHING ---
async function fetchLessons() {
    try {
        const lessonsCollection = collection(db, 'lessons');
        const querySnapshot = await getDocs(lessonsCollection);
        if (querySnapshot.empty) {
            console.log("Lesson database is empty.");
            lessonsData = [];
        } else {
            lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        console.log("Lessons successfully fetched for professor:", lessonsData);
    } catch (error) {
        console.error("Error fetching lessons from Firestore: ", error);
        showToast("Could not load lesson data. Please try refreshing the page.", true);
    }
}

export async function initProfessorDashboard() {
    await fetchLessons();
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    roleContentWrapper.innerHTML = `
        <div id="dashboard-professor" class="w-full flex main-view active">
            <aside id="professor-sidebar" class="w-full md:w-96 bg-white border-r border-slate-200 flex flex-col flex-shrink-0"></aside>
            <main id="main-content-area" class="flex-grow bg-slate-100 flex flex-col h-screen"></main>
        </div>
        <div id="telegram-interaction-view" class="hidden"></div>
        <div id="student-analysis-view" class="hidden"></div>
    `;

    setupProfessorNav();
    showProfessorContent('timeline');
}

// --- LOGIKA PRO DASHBOARD PROFESORA ---
function setupProfessorNav() {
    const nav = document.getElementById('main-nav');
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
    nav.querySelector('[data-view="interactions"]').addEventListener('click', (e) => {
        e.preventDefault();
        const currentCourseId = 'default-course'; // Placeholder
        renderTelegramInteractionView(currentCourseId);
    });
    nav.querySelector('[data-view="analytics"]').addEventListener('click', (e) => {
        e.preventDefault();
        showProfessorContent('analytics');
    });
}

export async function showProfessorContent(view, lesson = null) {
    const dashboardView = document.getElementById('dashboard-professor');
    const telegramView = document.getElementById('telegram-interaction-view');
    const analysisView = document.getElementById('student-analysis-view');

    // Hide all major views first
    if (telegramView) telegramView.classList.add('hidden');
    if (dashboardView) dashboardView.classList.add('hidden');
    if (analysisView) analysisView.classList.add('hidden');

    const sidebar = document.getElementById('professor-sidebar');
    const mainArea = document.getElementById('main-content-area');

    if (view === 'timeline' || view === 'editor') {
        if (dashboardView) dashboardView.classList.remove('hidden');
        mainArea.innerHTML = '';
        sidebar.innerHTML = '';
        mainArea.className = 'flex-grow bg-slate-100 flex flex-col h-screen view-transition';
    }

    if (view === 'timeline') {
        await fetchLessons();
        renderLessonLibrary(sidebar);
        renderTimeline(mainArea);
    } else if (view === 'editor') {
        currentLesson = lesson;
        renderEditorMenu(sidebar, currentLesson);
        showEditorContent('details', currentLesson);
    } else if (view === 'interactions') {
        const currentCourseId = 'default-course'; // Placeholder
        renderTelegramInteractionView(currentCourseId);
    } else if (view === 'analytics') {
        if (analysisView) analysisView.classList.remove('hidden');
        renderAnalytics();
    }
}

function renderLessonLibrary(container) {
    container.innerHTML = `
        <header class="p-4 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
            <h2 class="text-xl font-bold text-slate-800">Knihovna lekcí</h2>
            <div class="flex items-center space-x-2">
                <button id="create-new-lesson-btn" class="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800 transition transform hover:scale-105">+ Nová lekce</button>
            </div>
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
                pull: function (to, from) {
                    const toGroupName = to.options.group.name;
                    const fromGroupEl = from.el;
                    if (toGroupName === 'timeline-events') {
                        return fromGroupEl.id === 'lessons-active' ? 'clone' : false;
                    }
                    return true;
                },
                put: true
            },
            animation: 150,
            sort: true,
            ghostClass: 'blue-background-class',
            onAdd: async function (evt) {
                const itemEl = evt.item;
                const lessonId = itemEl.dataset.id;
                const toContainer = evt.to;
                const newStatus = toContainer.dataset.status;

                if (!lessonId || !newStatus) return;

                const lessonRef = doc(db, 'lessons', lessonId);
                try {
                    await updateDoc(lessonRef, { status: newStatus });
                    const lessonInData = lessonsData.find(l => l.id === lessonId);
                    if (lessonInData) lessonInData.status = newStatus;
                    const sidebar = document.getElementById('professor-sidebar');
                    if (sidebar) renderLessonLibrary(sidebar);
                } catch (error) {
                    console.error("Error updating lesson status:", error);
                    evt.from.appendChild(itemEl);
                    showToast("Došlo k chybě při změně stavu lekce.", true);
                }
            }
        });
    });
}

async function handleDeleteLesson(lessonId, deleteBtn) {
    if (confirm('Opravdu chcete smazat tuto lekci? Tato akce je nevratná.')) {
        const originalContent = deleteBtn.innerHTML;
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = `<div class="spinner-small"></div>`;

        try {
            const lessonRef = doc(db, 'lessons', lessonId);
            await deleteDoc(lessonRef);
            showToast('Lekce byla úspěšně smazána.');
            await initProfessorDashboard(); // Refresh UI
        } catch (error) {
            console.error("Chyba při mazání lekce: ", error);
            showToast("Při mazání lekce došlo k chybě.", true);
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = originalContent;
        }
    }
}

async function renderTimeline(container) {
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

    const eventsCollection = collection(db, 'timeline_events');
    const q = query(eventsCollection, where("courseId", "==", courseId));
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
        const eventIdToDelete = el.dataset.eventId;
        if (confirm('Opravdu chcete odebrat tuto lekci z plánu?')) {
            try {
                await deleteDoc(doc(db, 'timeline_events', eventIdToDelete));
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
        const children = Array.from(container.children);
        for (let i = 0; i < children.length; i++) {
            const eventId = children[i].dataset.eventId;
            if (eventId) {
                const eventRef = doc(db, 'timeline_events', eventId);
                batch.update(eventRef, { orderIndex: i });
            }
        }
        try {
            await batch.commit();
        } catch (error) {
            console.error("Failed to update order in Firestore:", error);
            showToast("Nepodařilo se uložit nové pořadí lekcí.", true);
        }
    };

    containers.forEach(container => {
        new Sortable(container, {
            group: { name: 'timeline-events', put: ['lesson-status'] },
            animation: 150,
            ghostClass: 'blue-background-class',
            dragClass: 'dragging',
            onAdd: async function (evt) {
                const itemEl = evt.item;
                const fromContainer = evt.from;
                const toContainer = evt.to;
                const scheduledDate = toContainer.dataset.date;

                if (fromContainer.classList.contains('lesson-group')) {
                    const lessonId = itemEl.dataset.id;
                    itemEl.remove();

                    if (!lessonId || !scheduledDate) return;
                    try {
                        await addDoc(collection(db, 'timeline_events'), {
                            lessonId: lessonId,
                            courseId: 'default-course',
                            scheduledDate: scheduledDate,
                            orderIndex: evt.newDraggableIndex,
                            createdAt: serverTimestamp()
                        });
                        showToast("Lekce byla naplánována.");
                        const mainArea = document.getElementById('main-content-area');
                        const sidebar = document.getElementById('professor-sidebar');
                        await renderTimeline(mainArea);
                        renderLessonLibrary(sidebar);
                    } catch (error) {
                        console.error("Error creating new timeline event:", error);
                        showToast("Nepodařilo se naplánovat lekci.", true);
                    }
                } else if (itemEl.dataset.eventId) {
                    const eventId = itemEl.dataset.eventId;
                    await updateDoc(doc(db, 'timeline_events', eventId), { scheduledDate: scheduledDate });
                    await updateFirestoreOrder(fromContainer);
                    await updateFirestoreOrder(toContainer);
                }
            },
            onUpdate: function (evt) {
                updateFirestoreOrder(evt.from);
            }
        });
    });
}

async function renderTelegramInteractionView(courseId) {
    const dashboardView = document.getElementById('dashboard-professor');
    const analysisView = document.getElementById('student-analysis-view');
    const telegramView = document.getElementById('telegram-interaction-view');

    if (dashboardView) dashboardView.classList.add('hidden');
    if (analysisView) analysisView.classList.add('hidden');
    if (telegramView) telegramView.classList.remove('hidden');

    telegramView.innerHTML = `
        <div class="w-full p-4 sm:p-6 md:p-8 bg-slate-50 h-screen overflow-y-auto">
            <header class="flex items-center justify-between mb-6">
                <div>
                    <h1 class="text-3xl font-extrabold text-slate-800">Interakce se studenty</h1>
                    <p class="text-slate-500 mt-1">Odesílejte zprávy studentům připojeným přes Telegram.</p>
                </div>
                <button id="back-to-timeline-from-interactions" class="text-sm font-semibold text-green-700 hover:underline">&larr; Zpět na hlavní panel</button>
            </header>
            <div id="student-telegram-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div class="p-8 text-center pulse-loader text-slate-500 col-span-full">Načítám studenty...</div>
            </div>
        </div>
    `;

    document.getElementById('back-to-timeline-from-interactions').addEventListener('click', () => {
        showProfessorContent('timeline');
    });

    const listContainer = document.getElementById('student-telegram-list');
    try {
        const studentsCollection = collection(db, 'students');
        const querySnapshot = await getDocs(studentsCollection);
        const students = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const connectedStudents = students.filter(s => s.telegramChatId);

        if (connectedStudents.length === 0) {
            listContainer.innerHTML = `<div class="bg-white p-6 rounded-lg shadow-sm text-center col-span-full"><p class="text-slate-500">Zatím se žádný student nepřipojil přes Telegram.</p></div>`;
            return;
        }

        listContainer.innerHTML = connectedStudents.map(student => `
            <div class="bg-white rounded-2xl shadow-lg p-6 flex flex-col" data-student-id="${student.id}">
                <div class="flex items-center mb-4">
                    <div class="w-10 h-10 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center font-bold text-lg flex-shrink-0">
                        ${student.email.charAt(0).toUpperCase()}
                    </div>
                    <p class="ml-3 font-semibold text-slate-700 truncate">${student.email}</p>
                </div>
                <textarea class="message-input w-full border-slate-300 rounded-lg p-2 h-28 flex-grow" placeholder="Napište zprávu..."></textarea>
                <button class="send-telegram-btn mt-4 w-full px-4 py-2 bg-sky-500 text-white font-semibold rounded-lg hover:bg-sky-600 transition-colors">Odeslat zprávu</button>
            </div>
        `).join('');

        document.querySelectorAll('.send-telegram-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const card = e.target.closest('[data-student-id]');
                const studentId = card.dataset.studentId;
                const textarea = card.querySelector('.message-input');
                const text = textarea.value.trim();

                if (!text) {
                    showToast("Zpráva nemůže být prázdná.", true);
                    return;
                }

                const originalButtonText = button.innerHTML;
                button.disabled = true;
                textarea.disabled = true;
                button.innerHTML = `<div class="spinner-small"></div><span class="ml-2">Odesílám...</span>`;

                try {
                    await sendMessageToStudent({ studentId, text });
                    showToast("Zpráva byla úspěšně odeslána.");
                    textarea.value = '';
                } catch (error) {
                    console.error("Error sending message to student:", error);
                    showToast(`Odeslání selhalo: ${error.message}`, true);
                } finally {
                    button.disabled = false;
                    textarea.disabled = false;
                    button.innerHTML = originalButtonText;
                }
            });
        });

    } catch (error) {
        console.error("Error fetching students for Telegram interaction:", error);
        listContainer.innerHTML = '<div class="p-4 bg-red-100 text-red-700 rounded-lg col-span-full">Nepodařilo se načíst studenty.</div>';
        showToast("Nepodařilo se načíst studenty.", true);
    }
}

function renderAnalytics() {
    const analysisView = document.getElementById('student-analysis-view');
    if (analysisView) {
        analysisView.innerHTML = `
            <div class="p-8">
                <h1 class="text-3xl font-extrabold text-slate-800">Analýza studentů</h1>
                <p class="text-slate-500 mt-1">Tato sekce se připravuje.</p>
            </div>
        `;
    }
}