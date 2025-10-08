import { collection, getDocs, getDoc, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { initializeUpload, initializeCourseMediaUpload, renderMediaLibraryFiles } from './upload-handler.js';
import { showToast } from './utils.js';
import { callGeminiApi, callGeminiForJson, callGenerateFromDocument } from './gemini-api.js';
import { db, functions } from './firebase-init.js';
import { initEditor, handleSaveGeneratedContent, showEditorContent } from './editor-handler.js';

let lessonsData = [];
let currentLesson = null;
let timelineEvents = [];
let sortableLists = [];

// Fetch all necessary professor data
async function fetchData() {
    try {
        const lessonsCollection = collection(db, 'lessons');
        const timelineCollection = collection(db, 'timeline_events');

        const [lessonsSnapshot, timelineSnapshot] = await Promise.all([
            getDocs(lessonsCollection),
            getDocs(timelineCollection)
        ]);

        lessonsData = lessonsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        timelineEvents = timelineSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        console.log("Professor data fetched:", { lessons: lessonsData, timeline: timelineEvents });
        return true;
    } catch (error) {
        console.error("Error fetching professor data: ", error);
        showToast("Nepodařilo se načíst data pro profesorský panel.", true);
        return false;
    }
}

// Main initialization function for the professor dashboard
export async function initProfessorDashboard() {
    const dataLoaded = await fetchData();
    const roleContentWrapper = document.getElementById('role-content-wrapper');

    if (!roleContentWrapper) {
        console.error("role-content-wrapper not found!");
        return;
    }

    if (!dataLoaded) {
        roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Chyba při načítání dat.</div>`;
        return;
    }

    roleContentWrapper.innerHTML = `
        <div id="dashboard-professor" class="w-full flex main-view active">
            <aside id="professor-sidebar" class="w-full md:w-96 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 h-screen"></aside>
            <main id="main-content-area" class="flex-grow bg-slate-100 flex flex-col h-screen"></main>
        </div>
        <div id="student-analysis-view" class="hidden w-full p-8 bg-slate-50 h-screen overflow-y-auto"></div>
        <div id="telegram-interaction-view" class="hidden w-full p-8 bg-slate-50 h-screen overflow-y-auto"></div>
    `;

    setupProfessorNav();
    showProfessorContent('timeline'); // Default view
}

// Set up the main navigation for the professor
function setupProfessorNav() {
    const nav = document.getElementById('main-nav');
    if (!nav) return;

    const navContent = `
        <li><button id="nav-timeline" class="nav-item p-3 rounded-lg flex items-center justify-center" title="Plánovač"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg></button></li>
        <li><button id="nav-students" class="nav-item p-3 rounded-lg flex items-center justify-center" title="Studenti"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></button></li>
        <li><button id="nav-telegram" class="nav-item p-3 rounded-lg flex items-center justify-center" title="Telegram interakce"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg></button></li>
    `;
    nav.innerHTML = navContent;

    document.getElementById('nav-timeline').addEventListener('click', () => showProfessorContent('timeline'));
    document.getElementById('nav-students').addEventListener('click', () => showProfessorContent('students'));
    document.getElementById('nav-telegram').addEventListener('click', () => showProfessorContent('telegram'));

    updateActiveNav('timeline');
}

// Router to show different content areas for the professor
async function showProfessorContent(view, lesson = null) {
    const mainDashboard = document.getElementById('dashboard-professor');
    const studentView = document.getElementById('student-analysis-view');
    const telegramView = document.getElementById('telegram-interaction-view');

    // Hide all views first
    [mainDashboard, studentView, telegramView].forEach(v => v.classList.remove('active', 'flex', 'hidden') || v.classList.add('hidden'));

    if (view === 'timeline') {
        mainDashboard.classList.add('active', 'flex');
        mainDashboard.classList.remove('hidden');
        renderSidebar();
        renderTimeline();
    } else if (view === 'editor' && lesson) {
        currentLesson = lesson;
        mainDashboard.classList.add('active', 'flex');
        mainDashboard.classList.remove('hidden');
        renderSidebar(true); // isEditing = true
        renderEditorMenu();
    } else if (view === 'students') {
        studentView.classList.add('active');
        studentView.classList.remove('hidden');
        // renderStudentAnalysis(studentView); // Placeholder for future implementation
    } else if (view === 'telegram') {
        telegramView.classList.add('active');
        telegramView.classList.remove('hidden');
        // renderTelegramInteractions(telegramView); // Placeholder for future implementation
    }
    updateActiveNav(view);
}

function updateActiveNav(view) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('text-white', 'bg-green-600');
    });
    const activeItem = document.getElementById(`nav-${view.split('-')[0]}`); // e.g., nav-timeline
    if (activeItem) {
        activeItem.classList.add('text-white', 'bg-green-600');
    }
}

// Render the sidebar (lesson library or editor controls)
function renderSidebar(isEditing = false) {
    const sidebar = document.getElementById('professor-sidebar');
    if (!sidebar) return;

    if (isEditing) {
        sidebar.innerHTML = `
            <div class="p-4 border-b border-slate-200">
                <button id="back-to-timeline" class="font-semibold text-slate-600 hover:text-green-600 flex items-center"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5 mr-2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg> Zpět na plánovač</button>
            </div>
            <div class="p-4">
                <h2 class="text-xl font-bold text-slate-800">${currentLesson.title}</h2>
                <p class="text-slate-500">${currentLesson.subtitle}</p>
            </div>
            <div id="editor-controls" class="p-4 border-t border-slate-200">
                <!-- Editor controls will be rendered here -->
            </div>
        `;
        document.getElementById('back-to-timeline').addEventListener('click', () => showProfessorContent('timeline'));
    } else {
        sidebar.innerHTML = `
            <div class="p-4 border-b border-slate-200 flex items-center justify-between">
                <h1 class="text-xl font-bold text-slate-800">Knihovna lekcí</h1>
                <button id="add-lesson-btn" class="p-2 rounded-lg bg-green-600 text-white hover:bg-green-700" title="Vytvořit novou lekci"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
            </div>
            <div id="lesson-library-container" class="flex-grow p-4 overflow-y-auto"></div>
        `;
        renderLessonLibrary(document.getElementById('lesson-library-container'));
        document.getElementById('add-lesson-btn').addEventListener('click', handleAddNewLesson);
    }
}

// Render the three columns of the lesson library
function renderLessonLibrary(container) {
    if (!container) return;

    const statuses = ['Aktivní', 'Naplánováno', 'Archivováno'];
    const statusClasses = {
        'Aktivní': 'border-green-500',
        'Naplánováno': 'border-sky-500',
        'Archivováno': 'border-slate-400'
    };

    container.innerHTML = statuses.map(status => `
        <div class="mb-6">
            <h3 class="text-lg font-semibold text-slate-700 mb-2">${status}</h3>
            <div id="list-${status.toLowerCase()}" class="min-h-[100px] lesson-list rounded-lg border-2 border-dashed ${statusClasses[status]} p-2">
                ${getLessonsByStatus(status).map(lesson => createLessonCard(lesson)).join('')}
            </div>
        </div>
    `).join('');

    // Attach event listeners after rendering
    container.querySelectorAll('.edit-lesson-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const lessonId = e.currentTarget.closest('.lesson-card').dataset.lessonId;
            const lesson = lessonsData.find(l => l.id === lessonId);
            if(lesson) showProfessorContent('editor', lesson);
        });
    });

    initSortable();
}

// Filter lessons by their status
function getLessonsByStatus(status) {
    const scheduledIds = new Set(timelineEvents.map(e => e.lessonId));
    let lessons;

    if (status === 'Naplánováno') {
        lessons = lessonsData.filter(lesson => scheduledIds.has(lesson.id));
    } else {
        lessons = lessonsData.filter(lesson => (lesson.status === status && !scheduledIds.has(lesson.id)));
    }
    return lessons.sort((a,b) => (a.orderIndex || 0) - (b.orderIndex || 0));
}

// Create the HTML for a single lesson card in the library
function createLessonCard(lesson) {
    return `
        <div class="lesson-card bg-white p-3 rounded-lg shadow-sm mb-2 cursor-grab" data-lesson-id="${lesson.id}">
            <div class="flex justify-between items-start">
                <div class="pointer-events-none">
                    <p class="font-bold text-slate-800">${lesson.title}</p>
                    <p class="text-sm text-slate-500">${lesson.subtitle}</p>
                </div>
                <button class="edit-lesson-btn p-1 rounded-md hover:bg-slate-200 flex-shrink-0" title="Upravit lekci">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-slate-500"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
            </div>
        </div>
    `;
}

// Render the main timeline/calendar view
function renderTimeline() {
    const mainContent = document.getElementById('main-content-area');
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div class="p-4 sm:p-6 md:p-8 h-full flex flex-col">
            <h1 class="text-2xl font-bold text-slate-800 mb-4">Plánovač</h1>
            <div id="timeline" class="flex-grow grid grid-cols-7 gap-1 bg-white p-2 rounded-lg shadow">
                <!-- Timeline will be generated here -->
            </div>
        </div>
    `;

    const timelineContainer = document.getElementById('timeline');
    // For simplicity, using a static 7-day view. A real app would have a date picker.
    const days = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
    const today = new Date();

    timelineContainer.innerHTML = days.map((day, i) => {
        const date = new Date(today);
        date.setDate(today.getDate() - today.getDay() + 1 + i); // Start from Monday
        const dateStr = date.toISOString().split('T')[0];

        const eventsOnThisDay = timelineEvents.filter(e => e.date === dateStr);

        return `
            <div class="bg-slate-50 rounded-md p-2">
                <div class="text-center font-semibold text-sm text-slate-600">${day} ${date.getDate()}.${date.getMonth()+1}.</div>
                <div class="timeline-day h-full mt-2" data-date="${dateStr}">
                    ${eventsOnThisDay.map(event => {
                        const lesson = lessonsData.find(l => l.id === event.lessonId);
                        return lesson ? `<div class="bg-sky-200 text-sky-800 p-2 rounded-md text-sm mb-1" data-event-id="${event.id}">${lesson.title}</div>` : '';
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
    initSortable(); // Re-init sortable for the new timeline days
}

// Initialize Sortable.js for all lists
function initSortable() {
    // Destroy previous instances to prevent memory leaks
    sortableLists.forEach(s => s.destroy());
    sortableLists = [];

    const lists = document.querySelectorAll('.lesson-list');
    lists.forEach(list => {
        const sortable = new Sortable(list, {
            group: 'lessons',
            animation: 150,
            fallbackOnBody: true,
            swapThreshold: 0.65,
            onEnd: handleDrop,
            pull: (to, from, item) => {
                // Allow cloning from 'Aktivní' list, but not from others
                if (from.id === 'list-aktivní') return 'clone';
                // Prevent dragging from 'Naplánováno' and 'Archivováno' back to library
                if (to.id.startsWith('list-') && from.id !== 'list-aktivní') return false;
                return true;
            }
        });
        sortableLists.push(sortable);
    });

    const timelineDays = document.querySelectorAll('.timeline-day');
    timelineDays.forEach(day => {
        const sortable = new Sortable(day, {
            group: 'lessons',
            animation: 150,
            onAdd: handleDrop
        });
        sortableLists.push(sortable);
    });
}

// Handle the drop event from Sortable.js
async function handleDrop(evt) {
    const { item, to, from, oldIndex, newIndex, pullMode } = evt;
    const lessonId = item.dataset.lessonId;
    const isCloning = pullMode === 'clone';

    // Case 1: Scheduling a lesson from 'Aktivní' to the timeline
    if (to.classList.contains('timeline-day') && from.id === 'list-aktivní') {
        const date = to.dataset.date;
        try {
            await addDoc(collection(db, "timeline_events"), {
                lessonId: lessonId,
                date: date,
                createdAt: serverTimestamp()
            });
            showToast('Lekce byla naplánována.');
        } catch (error) {
            console.error("Error scheduling lesson: ", error);
            showToast('Chyba při plánování lekce.', true);
            item.remove(); // Remove clone on failure
        }
    }
    // Case 2: Moving a lesson between library lists (e.g., Aktivní -> Archivováno)
    else if (to.id.startsWith('list-') && from.id.startsWith('list-')) {
        const newStatus = to.id.replace('list-', '').charAt(0).toUpperCase() + to.id.slice(6); // 'list-archivováno' -> 'Archivováno'
        try {
            await updateDoc(doc(db, "lessons", lessonId), { status: newStatus });
            showToast(`Lekce byla přesunuta do '${newStatus}'.`);
        } catch (error) {
            console.error("Error updating lesson status: ", error);
            showToast('Chyba při změně stavu lekce.', true);
            // Revert UI change
            from.insertBefore(item, from.children[oldIndex]);
        }
    }
    // Case 3: Removing a lesson from the timeline (by dragging it out)
    // This requires a "trash" area or logic to handle removal, not implemented here for brevity.

    // After any potential data change, refresh the entire view
    await fetchData();
    showProfessorContent('timeline');
}

// Handle creating a new lesson
async function handleAddNewLesson() {
    const title = prompt("Zadejte název nové lekce:");
    if (!title || title.trim() === '') return;

    try {
        const newLessonRef = await addDoc(collection(db, "lessons"), {
            title: title.trim(),
            subtitle: "Nově vytvořená lekce",
            content: "Začněte psát obsah...",
            status: "Aktivní",
            createdAt: serverTimestamp(),
            orderIndex: lessonsData.filter(l => l.status === 'Aktivní').length
        });
        showToast("Nová lekce byla úspěšně vytvořena.");
        // Refresh data and view
        await fetchData();
        renderLessonLibrary(document.getElementById('lesson-library-container'));
    } catch (error) {
        console.error("Error creating new lesson: ", error);
        showToast("Nepodařilo se vytvořit novou lekci.", true);
    }
}

// Render the editor menu (the main content area when editing a lesson)
function renderEditorMenu() {
    const mainContent = document.getElementById('main-content-area');
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div id="editor-container" class="w-full h-full bg-white"></div>
    `;

    // Initialize the Tiptap editor and its content
    initEditor('#editor-container', currentLesson);

    // After editor is initialized, render the controls in the sidebar
    renderEditorControls();
}

function renderEditorControls() {
    const controlsContainer = document.getElementById('editor-controls');
    if (!controlsContainer) return;

    controlsContainer.innerHTML = `
        <h3 class="font-bold text-slate-700 mb-2">Nástroje Editoru</h3>
        <div class="space-y-2">
            <button id="show-text-content" class="editor-tool-btn">Obsah lekce</button>
            <button id="show-quiz-content" class="editor-tool-btn">Kvíz</button>
            <button id="show-media-library" class="editor-tool-btn">Média</button>
            <hr>
            <button id="save-generated-content" class="bg-blue-500 text-white p-2 rounded-lg w-full">Uložit vygenerovaný obsah</button>
        </div>
    `;

    document.getElementById('show-text-content').addEventListener('click', () => showEditorContent('text'));
    document.getElementById('show-quiz-content').addEventListener('click', () => showEditorContent('quiz'));
    document.getElementById('show-media-library').addEventListener('click', () => {
        showEditorContent('media');
        renderMediaLibraryFiles(currentLesson.courseId || 'defaultCourse');
    });
    document.getElementById('save-generated-content').addEventListener('click', () => handleSaveGeneratedContent(currentLesson.id));
}