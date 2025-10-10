import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { renderEditorMenu, showEditorContent } from './editor-handler.js';
import { showToast } from './utils.js';
import { db } from './firebase-init.js';
import { initializeCourseMediaUpload, renderMediaLibraryFiles } from './upload-handler.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from './firebase-init.js';

let lessonsData = [];
const MAIN_COURSE_ID = "main-course"; 
const sendMessageToStudent = httpsCallable(functions, 'sendMessageToStudent');

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
            <li>
                <button data-view="timeline" class="nav-item p-3 rounded-lg flex items-center justify-center text-white bg-green-700" title="Plán výuky">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </button>
            </li>
            <li>
                <button data-view="media" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white" title="Knihovna médií">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                </button>
            </li>
             <li>
                <button data-view="interactions" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white" title="Interakce se studenty">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </button>
            </li>
            <li>
                <button data-view="students" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white" title="Studenti">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                </button>
            </li>
        `;

        nav.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                nav.querySelectorAll('.nav-item').forEach(b => {
                    b.classList.remove('bg-green-700', 'text-white');
                    b.classList.add('text-green-200');
                });
                e.currentTarget.classList.add('bg-green-700', 'text-white');
                showProfessorContent(view);
            });
        });
    }
}

async function showProfessorContent(view, lesson = null) {
    const sidebar = document.getElementById('professor-sidebar');
    const mainArea = document.getElementById('main-content-area');
    
    document.getElementById('dashboard-professor').style.display = 'flex';
    sidebar.style.display = 'flex';
    mainArea.style.display = 'flex';

    if (view === 'editor') {
        renderEditorMenu(sidebar, lesson);
    } else if (view === 'media') {
        sidebar.style.display = 'none';
        renderMediaLibrary(mainArea);
    } else if (view === 'students') {
        sidebar.style.display = 'none';
        renderStudentsView(mainArea);
    } else if (view === 'interactions') {
        sidebar.style.display = 'none';
        renderTelegramInteractionView(mainArea);
    }
    else { 
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

function renderMediaLibrary(container) {
    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white">
            <h1 class="text-3xl font-extrabold text-slate-800">Knihovna médií</h1>
            <p class="text-slate-500 mt-1">Spravujte všechny soubory pro váš kurz na jednom místě.</p>
        </header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6">
            <div class="bg-white p-6 rounded-2xl shadow-lg">
                <p class="text-slate-500 mb-4">Nahrajte soubory (.pdf), které chcete sdílet napříč všemi lekcemi.</p>
                <div id="course-media-upload-area" class="upload-zone rounded-lg p-10 text-center text-slate-500 cursor-pointer"><p class="font-semibold">Přetáhněte soubory sem nebo klikněte pro výběr</p></div>
                <input type="file" id="course-media-file-input" multiple class="hidden" accept=".pdf, application/pdf">
                <h3 class="font-bold text-slate-700 mt-6 mb-2">Nahrané soubory:</h3>
                <ul id="course-media-list" class="space-y-2"></ul>
            </div>
        </div>`;
    
    initializeCourseMediaUpload(MAIN_COURSE_ID);
    renderMediaLibraryFiles(MAIN_COURSE_ID);
}

async function renderStudentsView(container) {
    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white">
            <h1 class="text-3xl font-extrabold text-slate-800">Správa studentů</h1>
            <p class="text-slate-500 mt-1">Zobrazte seznam zapsaných studentů.</p>
        </header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6">
            <div id="students-list-container" class="bg-white p-6 rounded-2xl shadow-lg">
                <p class="text-center p-8 text-slate-400">Načítám studenty...</p>
            </div>
        </div>`;
    
    try {
        const studentsCollection = collection(db, 'students');
        const querySnapshot = await getDocs(studentsCollection);
        const students = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const containerEl = document.getElementById('students-list-container');
        
        if (students.length === 0) {
            containerEl.innerHTML = '<p class="text-center p-8 text-slate-500">Zatím se nezaregistroval žádný student.</p>';
            return;
        }

        const studentsHtml = students.map(student => `
            <div class="flex items-center justify-between p-3 border-b border-slate-100">
                <p class="text-slate-700">${student.email}</p>
                <span class="text-xs font-medium px-2 py-1 rounded-full ${student.telegramChatId ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'}">
                    ${student.telegramChatId ? 'Telegram připojen' : 'Telegram nepřipojen'}
                </span>
            </div>
        `).join('');

        containerEl.innerHTML = `<ul class="divide-y divide-slate-100">${studentsHtml}</ul>`;

    } catch (error) {
        console.error("Error fetching students:", error);
        document.getElementById('students-list-container').innerHTML = '<p class="text-center p-8 text-red-500">Nepodařilo se načíst studenty.</p>';
    }
}

async function renderTelegramInteractionView(container) {
    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white">
            <h1 class="text-3xl font-extrabold text-slate-800">Interakce se studenty</h1>
            <p class="text-slate-500 mt-1">Odesílejte zprávy studentům připojeným přes Telegram.</p>
        </header>
        <div id="student-telegram-list" class="flex-grow overflow-y-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div class="p-8 text-center text-slate-500 col-span-full">Načítám studenty...</div>
        </div>
    `;

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

        const studentCardsHtml = connectedStudents.map(student => `
            <div class="bg-white rounded-2xl shadow-lg p-6 flex flex-col" data-student-id="${student.id}">
                <div class="flex items-center mb-4">
                    <p class="font-semibold text-slate-700 truncate">${student.email}</p>
                </div>
                <textarea class="message-input w-full border-slate-300 rounded-lg p-2 h-28 flex-grow" placeholder="Napište zprávu..."></textarea>
                <button class="send-telegram-btn mt-4 w-full px-4 py-2 bg-sky-500 text-white font-semibold rounded-lg hover:bg-sky-600 transition-colors">Odeslat zprávu</button>
            </div>
        `).join('');
        listContainer.innerHTML = studentCardsHtml;

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
                button.innerHTML = `Odesílám...`;

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
        console.error("Error fetching students for Telegram:", error);
        listContainer.innerHTML = '<div class="p-4 bg-red-100 text-red-700 rounded-lg col-span-full">Nepodařilo se načíst studenty.</div>';
    }
}
