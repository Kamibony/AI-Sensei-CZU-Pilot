import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, query, orderBy, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { renderEditorMenu } from './editor-handler.js';
import { showToast } from './utils.js';
import { db } from './firebase-init.js';
import { initializeCourseMediaUpload, renderMediaLibraryFiles } from './upload-handler.js';
import { handleLogout } from './auth.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from './firebase-init.js';

let lessonsData = [];
const MAIN_COURSE_ID = "main-course"; 
const sendMessageToStudent = httpsCallable(functions, 'sendMessageToStudent');
let conversationsUnsubscribe = null;
let studentsUnsubscribe = null; // Nová premenná pre odhlásenie listenera

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

    setupProfessorNav();
    document.getElementById('logout-btn-nav').addEventListener('click', handleLogout);

    const lessonsLoaded = await fetchLessons();
    if (!lessonsLoaded) {
        document.getElementById('main-content-area').innerHTML = `<div class="p-8 text-center text-red-500">Chyba při načítání dat.</div>`;
        return;
    }
    showProfessorContent('timeline');
}

function setupProfessorNav() {
    const nav = document.getElementById('main-nav');
    if (nav) {
        nav.innerHTML = `
            <div class="flex flex-col h-full">
                <div class="flex-grow space-y-4">
                    <li><button data-view="timeline" class="nav-item p-3 rounded-lg flex items-center justify-center text-white bg-green-700" title="Plán výuky"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button></li>
                    <li><button data-view="media" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white" title="Knihovna médií"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></button></li>
                    <li><button data-view="interactions" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white" title="Interakce se studenty"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button></li>
                    <li><button data-view="analytics" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white" title="Analýza studentů"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 2v6l6.1 2.4-4.2 6L2.5 22"/><path d="M21.5 2v6l-6.1 2.4 4.2 6L21.5 22"/><path d="M12 2v20"/></svg></button></li>
                    <li><button data-view="students" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white" title="Správa studentů"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></button></li>
                </div>
                <div>
                    <li><button id="logout-btn-nav" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-red-700 hover:text-white" title="Odhlásit se"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg></button></li>
                </div>
            </div>
        `;
        nav.querySelectorAll('button[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                nav.querySelectorAll('button[data-view]').forEach(b => {
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
    // Odhlásíme listenery z jiných sekcí, aby neběžely zbytečně na pozadí
    if (conversationsUnsubscribe) { conversationsUnsubscribe(); conversationsUnsubscribe = null; }
    if (studentsUnsubscribe) { studentsUnsubscribe(); studentsUnsubscribe = null; }

    const sidebar = document.getElementById('professor-sidebar');
    const mainArea = document.getElementById('main-content-area');
    if (!sidebar || !mainArea) return;

    sidebar.style.display = 'flex';
    mainArea.style.display = 'flex';

    if (view === 'editor') {
        renderEditorMenu(sidebar, lesson);
    } else if (['media', 'students', 'interactions', 'analytics'].includes(view)) {
        sidebar.style.display = 'none';
        if (view === 'media') renderMediaLibrary(mainArea);
        if (view === 'students') renderStudentsView(mainArea);
        if (view === 'interactions') renderStudentInteractions(mainArea);
        if (view === 'analytics') renderAnalytics(mainArea);
    } else { 
        await fetchLessons();
        renderLessonLibrary(sidebar);
        renderTimeline(mainArea);
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

async function renderTimeline(container) {
    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white">
            <h1 class="text-3xl font-extrabold text-slate-800">Plán výuky</h1>
            <p class="text-slate-500 mt-1">Naplánujte lekce přetažením z knihovny vlevo.</p>
        </header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6">
            <div id="timeline-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"></div>
        </div>
    `;

    const timelineContainer = container.querySelector('#timeline-container');
    const q = query(collection(db, 'timeline_events'), orderBy("orderIndex"));
    const querySnapshot = await getDocs(q);
    const timelineEvents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    for (let i = 0; i < 10; i++) {
        const dayWrapper = document.createElement('div');
        dayWrapper.className = 'day-slot bg-white rounded-xl p-3 border-2 border-transparent transition-colors min-h-[200px] shadow-sm flex flex-col';
        dayWrapper.dataset.dayIndex = i;
        
        const dateStr = getLocalizedDate(i);
        dayWrapper.innerHTML = `
            <div class="text-center pb-2 mb-2 border-b border-slate-200">
                <p class="font-bold text-slate-700">${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}</p>
            </div>
            <div class="lessons-container flex-grow space-y-2"></div>
        `;
        timelineContainer.appendChild(dayWrapper);
    }
    
    timelineEvents.forEach(event => {
        const dayIndex = event.dayIndex || 0;
        const daySlot = timelineContainer.querySelector(`.day-slot[data-day-index='${dayIndex}'] .lessons-container`);
        if (daySlot) {
            daySlot.appendChild(renderScheduledEvent(event));
        }
    });

    timelineContainer.querySelectorAll('.day-slot .lessons-container').forEach(lessonsContainer => {
        if (typeof Sortable !== 'undefined') {
            new Sortable(lessonsContainer, {
                group: 'lessons',
                animation: 150,
                ghostClass: 'opacity-50',
                onAdd: (evt) => handleLessonDrop(evt),
                onUpdate: (evt) => handleLessonMove(evt)
            });
        }
    });
}

function renderScheduledEvent(event) {
    const lesson = lessonsData.find(l => l.id === event.lessonId);
    if (!lesson) return document.createElement('div');

    const el = document.createElement('div');
    el.className = 'lesson-bubble p-3 rounded-lg shadow-sm flex items-center justify-between border bg-green-50 text-green-800 border-green-200 cursor-grab';
    el.dataset.eventId = event.id;
    el.dataset.lessonId = event.lessonId;
    el.innerHTML = `
        <div class="flex items-center space-x-3 flex-grow">
            <span class="text-xl">${lesson.icon}</span>
            <span class="font-semibold text-sm">${lesson.title}</span>
        </div>
        <button class="delete-event-btn p-1 rounded-full hover:bg-red-200 text-slate-400 hover:text-red-600 transition-colors" title="Odebrat z plánu">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>`;

    el.querySelector('.delete-event-btn').addEventListener('click', async () => {
        if (confirm('Opravdu chcete odebrat tuto lekci z plánu?')) {
            try {
                await deleteDoc(doc(db, 'timeline_events', event.id));
                el.remove();
                showToast("Lekce byla odebrána z plánu.");
                await updateAllOrderIndexes();
            } catch (error) {
                console.error("Error deleting timeline event:", error);
                showToast("Chyba při odstraňování události.", true);
            }
        }
    });
    return el;
}

async function handleLessonDrop(evt) {
    const lessonId = evt.item.dataset.lessonId;
    const dayIndex = evt.to.closest('.day-slot').dataset.dayIndex;
    const tempEl = evt.item;
    
    tempEl.innerHTML = `Načítám...`;

    try {
        const newEventData = {
            lessonId: lessonId,
            dayIndex: parseInt(dayIndex),
            createdAt: serverTimestamp(),
            orderIndex: 0 
        };
        const docRef = await addDoc(collection(db, 'timeline_events'), newEventData);
        
        const newElement = renderScheduledEvent({ id: docRef.id, ...newEventData });
        evt.item.parentNode.replaceChild(newElement, evt.item);

        showToast("Lekce naplánována.");
        await updateAllOrderIndexes();

    } catch (error) {
        console.error("Error scheduling lesson:", error);
        showToast("Chyba při plánování lekce.", true);
        tempEl.remove();
    }
}

async function handleLessonMove(evt) {
    const eventId = evt.item.dataset.eventId;
    const newDayIndex = evt.to.closest('.day-slot').dataset.dayIndex;
    
    try {
        const docRef = doc(db, 'timeline_events', eventId);
        await updateDoc(docRef, { dayIndex: parseInt(newDayIndex) });
        await updateAllOrderIndexes();
    } catch (error) {
        console.error("Error moving lesson:", error);
        showToast("Chyba při přesouvání lekce.", true);
    }
}

async function updateAllOrderIndexes() {
    const timelineContainer = document.getElementById('timeline-container');
    if (!timelineContainer) return;
    
    const allEvents = Array.from(timelineContainer.querySelectorAll('.lesson-bubble'));
    const batch = writeBatch(db);
    
    allEvents.forEach((item, index) => {
        const eventId = item.dataset.eventId;
        if (eventId) {
            const docRef = doc(db, 'timeline_events', eventId);
            batch.update(docRef, { orderIndex: index });
        }
    });

    try {
        await batch.commit();
    } catch (error) {
        console.error("Error updating order indexes:", error);
    }
}

function renderMediaLibrary(container) {
    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white"><h1 class="text-3xl font-extrabold text-slate-800">Knihovna médií</h1><p class="text-slate-500 mt-1">Spravujte všechny soubory pro váš kurz na jednom místě.</p></header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6"><div class="bg-white p-6 rounded-2xl shadow-lg"><p class="text-slate-500 mb-4">Nahrajte soubory (PDF), které chcete použít pro generování obsahu.</p><div id="course-media-upload-area" class="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center text-slate-500 cursor-pointer hover:bg-green-50 hover:border-green-400"><p class="font-semibold">Přetáhněte soubory sem nebo klikněte pro výběr</p></div><input type="file" id="course-media-file-input" multiple class="hidden" accept=".pdf"><h3 class="font-bold text-slate-700 mt-6 mb-2">Nahrané soubory:</h3><ul id="course-media-list" class="space-y-2"></ul></div></div>`;
    initializeCourseMediaUpload(MAIN_COURSE_ID);
    renderMediaLibraryFiles(MAIN_COURSE_ID);
}

async function renderStudentsView(container) {
    container.innerHTML = `
        <header class="text-center p-6 border-b border-slate-200 bg-white"><h1 class="text-3xl font-extrabold text-slate-800">Správa studentů</h1><p class="text-slate-500 mt-1">Zobrazte seznam zapsaných studentů.</p></header>
        <div class="flex-grow overflow-y-auto p-4 md:p-6"><div id="students-list-container" class="bg-white p-6 rounded-2xl shadow-lg"><p class="text-center p-8 text-slate-400">Načítám studenty...</p></div></div>`;
    
    const containerEl = document.getElementById('students-list-container');
    const q = query(collection(db, 'students'), orderBy("createdAt", "desc"));

    if (studentsUnsubscribe) studentsUnsubscribe();

    studentsUnsubscribe = onSnapshot(q, (querySnapshot) => {
        const students = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (students.length === 0) {
            containerEl.innerHTML = '<p class="text-center p-8 text-slate-500">Zatím se nezaregistroval žádný student.</p>';
            return;
        }

        const studentsHtml = students.map(student => `
            <div class="flex items-center justify-between p-3 border-b border-slate-100">
                <div><p class="text-slate-800 font-semibold">${student.name || 'Jméno neuvedeno'}</p><p class="text-sm text-slate-500">${student.email}</p></div>
                <span class="text-xs font-medium px-2 py-1 rounded-full ${student.telegramChatId ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'}">${student.telegramChatId ? 'Telegram připojen' : 'Telegram nepřipojen'}</span>
            </div>`).join('');
        
        containerEl.innerHTML = `<div class="divide-y divide-slate-100">${studentsHtml}</div>`;
    }, (error) => {
        console.error("Error fetching students:", error);
        containerEl.innerHTML = '<p class="text-center p-8 text-red-500">Nepodařilo se načíst studenty.</p>';
    });
}

async function renderStudentInteractions(container) {
    container.className = 'flex-grow flex h-screen bg-white view-transition';
    container.innerHTML = `
        <aside class="w-full md:w-1/3 border-r border-slate-200 flex flex-col">
            <header class="p-4 border-b border-slate-200 flex-shrink-0"><h2 class="font-bold text-slate-800">Konverzace se studenty</h2></header>
            <div id="conversations-list" class="overflow-y-auto"><p class="p-4 text-slate-400">Načítám konverzace...</p></div>
        </aside>
        <main id="chat-window" class="w-full md:w-2/3 flex flex-col bg-slate-50">
            <div class="flex-grow flex items-center justify-center text-slate-400">Vyberte konverzaci ze seznamu vlevo</div>
        </main>
    `;

    const conversationsListEl = document.getElementById('conversations-list');
    
    if (conversationsUnsubscribe) conversationsUnsubscribe();

    const convQuery = query(collection(db, "conversations"), orderBy("lastMessageTimestamp", "desc"));
    conversationsUnsubscribe = onSnapshot(convQuery, (querySnapshot) => {
        if (querySnapshot.empty) {
            conversationsListEl.innerHTML = `<p class="p-4 text-slate-400">Zatím zde nejsou žádné konverzace.</p>`;
            return;
        }
        
        conversationsListEl.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const conv = doc.data();
            const convEl = document.createElement('div');
            convEl.className = `p-4 flex items-center space-x-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${conv.professorHasUnread ? 'bg-green-50' : ''}`;
            convEl.dataset.studentId = conv.studentId;

            convEl.innerHTML = `
                <div>
                    <p class="font-semibold text-sm text-slate-800">${conv.studentName}</p>
                    <p class="text-xs ${conv.professorHasUnread ? 'text-green-600 font-bold' : 'text-slate-500'}">${(conv.lastMessage || "").substring(0, 30)}...</p>
                </div>
            `;
            convEl.addEventListener('click', () => renderChatWindow(conv.studentId, conv.studentName));
            conversationsListEl.appendChild(convEl);
        });
    });
}

function renderChatWindow(studentId, studentName) {
    const chatWindow = document.getElementById('chat-window');
    chatWindow.innerHTML = `
        <header class="p-4 border-b border-slate-200 flex items-center space-x-3 bg-white flex-shrink-0">
            <h3 class="font-bold text-slate-800">${studentName}</h3>
        </header>
        <div id="messages-container" class="flex-grow p-4 overflow-y-auto space-y-4">Načítám zprávy...</div>
        <footer class="p-4 bg-white border-t border-slate-200 flex-shrink-0">
            <div class="relative">
                <textarea id="chat-input" placeholder="Napište odpověď..." class="w-full bg-slate-100 border-transparent rounded-lg p-3 pr-28 focus:ring-2 focus:ring-green-500 resize-none" rows="1"></textarea>
                <button id="ai-reply-btn" class="absolute right-14 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-amber-700" title="Navrhnout odpověď (AI)">✨</button>
                <button id="send-reply-btn" class="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-green-700" title="Odeslat">
                     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </div>
        </footer>
    `;

    updateDoc(doc(db, "conversations", studentId), { professorHasUnread: false });

    const messagesContainer = document.getElementById('messages-container');
    const messagesQuery = query(collection(db, "conversations", studentId, "messages"), orderBy("timestamp"));
    
    onSnapshot(messagesQuery, (querySnapshot) => {
        messagesContainer.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const msg = doc.data();
            const msgEl = document.createElement('div');
            const sender = msg.senderId === 'professor' ? 'prof' : 'student';
            msgEl.className = `flex ${sender === 'prof' ? 'justify-end' : 'justify-start'}`;
            msgEl.innerHTML = `<div class="max-w-md p-3 rounded-xl ${sender === 'prof' ? 'bg-green-700 text-white' : 'bg-white shadow-sm'}">${msg.text}</div>`;
            messagesContainer.appendChild(msgEl);
        });
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });

    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-reply-btn');

    const handleSend = async () => {
        const text = chatInput.value.trim();
        if (!text) return;

        chatInput.disabled = true;
        sendBtn.disabled = true;

        try {
            await sendMessageToStudent({ studentId: studentId, text: text });
            chatInput.value = '';
        } catch (error) {
            console.error("Error sending message:", error);
            showToast(`Odeslání selhalo: ${error.message}`, true);
        } finally {
            chatInput.disabled = false;
            sendBtn.disabled = false;
            chatInput.focus();
        }
    };
    
    sendBtn.addEventListener('click', handleSend);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    document.getElementById('ai-reply-btn').addEventListener('click', () => {
        chatInput.value = "AI návrh: Děkuji za Váš dotaz, podívám se na to a dám Vám vědět.";
    });
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
