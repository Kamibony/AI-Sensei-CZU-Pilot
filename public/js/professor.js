import { db } from './firebase-init.js';
import { collection, getDocs, doc, setDoc, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
import { setupProfessorNav } from './views/professor/navigation.js';
import { setupTimelineView } from './views/professor/timeline-view.js';
import { renderStudentList } from './views/professor/students-view.js';
import { showStudentProfile } from './views/professor/student-profile-view.js';
import { initializeTextEditor, getEditorContent } from './editor-handler.js';

let lessons = [];
let students = [];
let currentLessonId = null;
let lessonsUnsubscribe = null;
let studentsUnsubscribe = null;

const presentationThemes = {
    default: { name: 'Základná', bg: 'bg-slate-700', text: 'text-white', slideBg: 'bg-white', btn: 'bg-slate-200' },
    forest: { name: 'Les', bg: 'bg-green-800', text: 'text-white', slideBg: 'bg-green-50', btn: 'bg-green-200' },
    ocean: { name: 'Oceán', bg: 'bg-blue-800', text: 'text-white', slideBg: 'bg-blue-50', btn: 'bg-blue-200' },
    sunset: { name: 'Západ Slnka', bg: 'bg-orange-700', text: 'text-white', slideBg: 'bg-orange-50', btn: 'bg-orange-200' },
    classic: { name: 'Klasika', bg: 'bg-gray-800', text: 'text-yellow-200', slideBg: 'bg-gray-100', btn: 'bg-yellow-200' }
};

async function fetchLessons() {
    try {
        const lessonsCollection = collection(db, 'lessons');
        const lessonsSnapshot = await getDocs(lessonsCollection);
        lessons = lessonsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return true;
    } catch (error) {
        console.error("Error fetching lessons:", error);
        showToast("Nepodařilo se načíst lekce.", true);
        return false;
    }
}

async function fetchStudents() {
    try {
        const studentsCollection = collection(db, 'students');
        const studentsSnapshot = await getDocs(studentsCollection);
        students = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching students:", error);
        showToast("Nepodařilo se načíst studenty.", true);
    }
}

// --- NOVÁ, FUNKČNÁ VERZIA `showView` ---
// Táto funkcia teraz reálne vykresľuje obsah
async function showView(view, data) {
    const contentArea = document.getElementById('professor-content-area');
    if (!contentArea) return;

    contentArea.innerHTML = '<p class="p-8 text-center text-slate-500">Načítám...</p>';

    switch (view) {
        case 'lessons':
            renderLessonsList(contentArea);
            break;
        case 'students':
            await fetchStudents();
            renderStudentList(contentArea, students, (studentId) => {
                showView('student-profile', studentId);
            });
            break;
        case 'student-profile':
            // 'data' v tomto prípade je studentId
            showStudentProfile(contentArea, data, () => showView('students'));
            break;
        case 'timeline':
            await setupTimelineView(contentArea, lessons);
            break;
        case 'interactions':
        case 'analytics':
        case 'media':
            contentArea.innerHTML = `<p class="p-8 text-center text-slate-500">Sekce '${view}' se připravuje.</p>`;
            break;
        default:
            renderLessonsList(contentArea);
            break;
    }
}


function renderLessonsList(container) {
    const lessonsHtml = lessons.map(lesson => `
        <div class="bg-white rounded-2xl shadow-lg overflow-hidden mb-6 hover:shadow-xl transition-shadow duration-300">
            <div class="p-6">
                <div class="flex items-start justify-between">
                    <div>
                        <p class="text-sm font-semibold text-green-600">${lesson.number || ' '}</p>
                        <h2 class="text-2xl font-bold text-slate-800 mt-1">${lesson.title}</h2>
                        <p class="text-slate-500">${lesson.subtitle}</p>
                    </div>
                    <div class="flex items-center">
                         <span class="text-4xl mr-4">${lesson.icon}</span>
                         <button class="edit-lesson-btn p-2 rounded-full hover:bg-slate-100" data-id="${lesson.id}" title="Upravit lekci">
                            <svg xmlns="http://www.w.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                         </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="p-4 sm:p-6 md:p-8">
            <div class="flex justify-between items-center mb-6">
                <h1 class="text-3xl md:text-4xl font-extrabold text-slate-800">Přehled Lekcí</h1>
                <button id="add-lesson-btn" class="bg-green-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-800 transition-colors">Vytvořit novou lekci</button>
            </div>
            <div id="lessons-list-container">
                ${lessonsHtml.length > 0 ? lessonsHtml : '<p class="text-center text-slate-500 p-8">Zatím nebyly vytvořeny žádné lekce.</p>'}
            </div>
        </div>
    `;

    document.getElementById('add-lesson-btn').addEventListener('click', () => showLessonEditor(null));
    container.querySelectorAll('.edit-lesson-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const lessonId = e.currentTarget.dataset.id;
            const lesson = lessons.find(l => l.id === lessonId);
            showLessonEditor(lesson);
        });
    });
}

function renderPresentationEditor(presentationData, container) {
    let currentData = presentationData || { slides: [{ title: '', points: [''] }], theme: 'default' };
    if (!currentData.slides || currentData.slides.length === 0) {
        currentData.slides = [{ title: '', points: [''] }];
    }
    if (!currentData.theme) {
        currentData.theme = 'default';
    }

    const render = () => {
        const slidesHtml = currentData.slides.map((slide, sIndex) => {
            const pointsHtml = slide.points.map((point, pIndex) => `
                <div class="flex items-center mb-2">
                    <input type="text" value="${point}" class="flex-grow p-2 border rounded-lg point-input" data-s-index="${sIndex}" data-p-index="${pIndex}">
                    <button class="ml-2 text-red-500 hover:text-red-700 remove-point-btn" data-s-index="${sIndex}" data-p-index="${pIndex}">Odstrániť</button>
                </div>
            `).join('');
            return `
                <div class="bg-slate-100 p-4 rounded-lg mb-4 slide-container">
                    <label class="block font-bold mb-2">Nadpis slajdu ${sIndex + 1}</label>
                    <input type="text" value="${slide.title}" class="w-full p-2 border rounded-lg mb-3 title-input" data-s-index="${sIndex}">
                    <label class="block font-bold mb-2">Body</label>
                    ${pointsHtml}
                    <button class="text-green-600 hover:text-green-800 font-semibold mt-2 add-point-btn" data-s-index="${sIndex}">+ Pridať bod</button>
                    <button class="block text-red-600 hover:text-red-800 font-semibold mt-4 remove-slide-btn" data-s-index="${sIndex}">Odstrániť slajd</button>
                </div>
            `;
        }).join('');

        const themeButtonsHtml = Object.entries(presentationThemes).map(([key, theme]) => `
            <button type="button" class="theme-btn p-2 border-2 rounded-lg text-sm ${currentData.theme === key ? 'border-blue-500 ring-2 ring-blue-300' : 'border-transparent'}" data-theme="${key}">
                <div class="w-16 h-10 ${theme.bg} rounded-md mx-auto"></div>
                <span class="block text-center mt-1 text-xs">${theme.name}</span>
            </button>
        `).join('');

        container.innerHTML = `
            <div id="presentation-editor-container" data-theme="${currentData.theme}">
                <h3 class="text-xl font-bold mb-4">Editor Prezentácie</h3>
                <div class="mb-6">
                    <label class="block font-bold mb-2">Vyberte si šablónu</label>
                    <div class="flex space-x-2 p-2 bg-slate-100 rounded-lg">
                        ${themeButtonsHtml}
                    </div>
                </div>
                <div id="slides-list">${slidesHtml}</div>
                <button id="add-slide-btn" class="mt-4 bg-blue-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-600">Pridať nový slajd</button>
            </div>
        `;
    };

    render();

    container.addEventListener('input', (e) => {
        if (e.target.classList.contains('title-input')) {
            const sIndex = e.target.dataset.sIndex;
            currentData.slides[sIndex].title = e.target.value;
        }
        if (e.target.classList.contains('point-input')) {
            const { sIndex, pIndex } = e.target.dataset;
            currentData.slides[sIndex].points[pIndex] = e.target.value;
        }
    });

    container.addEventListener('click', (e) => {
        if (e.target.classList.contains('add-point-btn')) {
            const sIndex = e.target.dataset.sIndex;
            currentData.slides[sIndex].points.push('');
            render();
        }
        if (e.target.classList.contains('remove-point-btn')) {
            const { sIndex, pIndex } = e.target.dataset;
            currentData.slides[sIndex].points.splice(pIndex, 1);
            render();
        }
        if (e.target.id === 'add-slide-btn') {
            currentData.slides.push({ title: '', points: [''] });
            render();
        }
        if (e.target.classList.contains('remove-slide-btn')) {
            const sIndex = e.target.dataset.sIndex;
            if (currentData.slides.length > 1) {
                currentData.slides.splice(sIndex, 1);
                render();
            } else {
                showToast('Musí zostať aspoň jeden slajd.', true);
            }
        }
        const themeBtn = e.target.closest('.theme-btn');
        if (themeBtn) {
            currentData.theme = themeBtn.dataset.theme;
            document.getElementById('presentation-editor-container').dataset.theme = currentData.theme;
            render();
        }
    });
}

function getLessonDataFromEditor() {
    const lessonData = {
        title: document.getElementById('lesson-title').value,
        subtitle: document.getElementById('lesson-subtitle').value,
        icon: document.getElementById('lesson-icon').value,
        number: document.getElementById('lesson-number').value,
        content: getEditorContent(),
        videoUrl: document.getElementById('lesson-video-url').value,
    };

    const presentationEditor = document.getElementById('presentation-editor-container');
    if (presentationEditor) {
        const slides = [];
        presentationEditor.querySelectorAll('.slide-container').forEach((slideEl, sIndex) => {
            const title = slideEl.querySelector(`.title-input[data-s-index="${sIndex}"]`).value;
            const points = [];
            slideEl.querySelectorAll(`.point-input[data-s-index="${sIndex}"]`).forEach(pointEl => {
                points.push(pointEl.value);
            });
            slides.push({ title, points });
        });
        lessonData.presentationData = {
            slides: slides,
            theme: presentationEditor.dataset.theme || 'default'
        };
    }
    return lessonData;
}

async function handleSaveLesson() {
    const lessonData = getLessonDataFromEditor();
    if (!lessonData.title) {
        showToast("Název lekce je povinný.", true);
        return;
    }

    try {
        const lessonRef = currentLessonId ? doc(db, 'lessons', currentLessonId) : doc(collection(db, 'lessons'));
        await setDoc(lessonRef, lessonData, { merge: true });
        showToast("Lekce byla úspěšně uložena.");
        currentLessonId = null;
        showView('lessons');
    } catch (error) {
        console.error("Error saving lesson:", error);
        showToast("Uložení lekce se nezdařilo.", true);
    }
}

async function handleDeleteLesson() {
    if (!currentLessonId) return;
    if (!confirm("Opravdu si přejete smazat tuto lekci? Tato akce je nevratná.")) return;

    try {
        await deleteDoc(doc(db, 'lessons', currentLessonId));
        showToast("Lekce byla smazána.");
        currentLessonId = null;
        showView('lessons');
    } catch (error) {
        console.error("Error deleting lesson:", error);
        showToast("Smazání lekce se nezdařilo.", true);
    }
}

function showLessonEditor(lesson) {
    currentLessonId = lesson ? lesson.id : null;
    const contentArea = document.getElementById('professor-content-area');
    const lessonData = lesson || {};

    contentArea.innerHTML = `
        <div class="p-4 sm:p-6 md:p-8">
            <button id="back-to-lessons-btn" class="mb-6 text-green-700 font-semibold hover:underline">&larr; Zpět na přehled</button>
            <h1 class="text-3xl md:text-4xl font-extrabold text-slate-800 mb-6">${lesson ? 'Upravit Lekci' : 'Nová Lekce'}</h1>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div class="md:col-span-2">
                    <label for="lesson-title" class="block text-sm font-medium text-slate-700 mb-1">Název lekce</label>
                    <input type="text" id="lesson-title" class="w-full p-2 border rounded-lg" value="${lessonData.title || ''}">
                </div>
                <div>
                    <label for="lesson-icon" class="block text-sm font-medium text-slate-700 mb-1">Ikona (Emoji)</label>
                    <input type="text" id="lesson-icon" class="w-full p-2 border rounded-lg" value="${lessonData.icon || '📚'}">
                </div>
                <div class="md:col-span-2">
                    <label for="lesson-subtitle" class="block text-sm font-medium text-slate-700 mb-1">Podtitulek</label>
                    <input type="text" id="lesson-subtitle" class="w-full p-2 border rounded-lg" value="${lessonData.subtitle || ''}">
                </div>
                 <div>
                    <label for="lesson-number" class="block text-sm font-medium text-slate-700 mb-1">Číslo lekce</label>
                    <input type="text" id="lesson-number" class="w-full p-2 border rounded-lg" value="${lessonData.number || ''}">
                </div>
            </div>

            <div class="bg-white rounded-2xl shadow-lg p-6">
                 <h2 class="text-xl font-bold text-slate-800 mb-4">Obsah Lekce</h2>
                 <div id="lesson-content-tabs" class="border-b border-slate-200 mb-4">
                     <nav class="flex space-x-4">
                         <button data-tab="text" class="content-tab py-2 px-4 font-semibold border-b-2 border-green-700 text-green-700">Text</button>
                         <button data-tab="presentation" class="content-tab py-2 px-4 font-semibold border-b-2 border-transparent text-slate-500">Prezentace</button>
                         <button data-tab="video" class="content-tab py-2 px-4 font-semibold border-b-2 border-transparent text-slate-500">Video</button>
                     </nav>
                 </div>
                 <div id="lesson-content-editors">
                    <div id="editor-text" class="content-editor">
                        <div id="text-editor-container"></div>
                    </div>
                    <div id="editor-presentation" class="content-editor hidden"></div>
                    <div id="editor-video" class="content-editor hidden">
                        <label for="lesson-video-url" class="block text-sm font-medium text-slate-700 mb-1">URL adresa YouTube videa</label>
                        <input type="text" id="lesson-video-url" class="w-full p-2 border rounded-lg" placeholder="https://www.youtube.com/watch?v=..." value="${lessonData.videoUrl || ''}">
                    </div>
                 </div>
            </div>
            
            <div class="mt-6 flex justify-end space-x-4">
                ${lesson ? `<button id="delete-lesson-btn" class="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700">Smazat</button>` : ''}
                <button id="save-lesson-btn" class="bg-green-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-800">Uložit lekci</button>
            </div>
        </div>
    `;

    initializeTextEditor('#text-editor-container', lessonData.content || '');
    renderPresentationEditor(lessonData.presentationData, document.getElementById('editor-presentation'));
    
    document.getElementById('back-to-lessons-btn').addEventListener('click', () => showView('lessons'));
    document.getElementById('save-lesson-btn').addEventListener('click', handleSaveLesson);
    if (lesson) {
        document.getElementById('delete-lesson-btn').addEventListener('click', handleDeleteLesson);
    }

    document.querySelectorAll('.content-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.content-tab').forEach(t => {
                t.classList.remove('border-green-700', 'text-green-700');
                t.classList.add('border-transparent', 'text-slate-500');
            });
            e.target.classList.add('border-green-700', 'text-green-700');
            e.target.classList.remove('border-transparent', 'text-slate-500');

            document.querySelectorAll('.content-editor').forEach(editor => editor.classList.add('hidden'));
            document.getElementById(`editor-${e.target.dataset.tab}`).classList.remove('hidden');
        });
    });
}

export async function initProfessorDashboard() {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;
    
    roleContentWrapper.innerHTML = `
        <div class="flex-grow flex">
            <div id="professor-content-area" class="flex-grow overflow-y-auto bg-slate-50">
            </div>
        </div>
    `;
    
    // Odovzdáme novú, funkčnú `showView` do navigačného modulu
    await setupProfessorNav(showView);

    if (lessonsUnsubscribe) lessonsUnsubscribe();
    lessonsUnsubscribe = onSnapshot(query(collection(db, "lessons"), orderBy("title")), (snapshot) => {
        lessons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const activeNavButton = document.querySelector('#main-nav .nav-item.bg-green-700');
        const currentView = activeNavButton ? activeNavButton.dataset.view : 'lessons';
        
        if (currentView === 'lessons' && !document.getElementById('lesson-title')) {
             showView('lessons');
        }
    });

    if (studentsUnsubscribe) studentsUnsubscribe();
    studentsUnsubscribe = onSnapshot(collection(db, "students"), (snapshot) => {
        students = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const activeNavButton = document.querySelector('#main-nav .nav-item.bg-green-700');
        const currentView = activeNavButton ? activeNavButton.dataset.view : 'lessons';

        if (currentView === 'students' && !document.querySelector('.student-profile-view')) {
            showView('students');
        }
    });

    // Zobrazíme východiskový pohľad po inicializácii
    showView('lessons');
}
