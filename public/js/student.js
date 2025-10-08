import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { showToast } from './utils.js';
import { db, auth, functions } from './firebase-init.js'; // Import services directly

let lessonsData = [];

async function fetchLessons() {
    try {
        const lessonsCollection = collection(db, 'lessons');
        const querySnapshot = await getDocs(lessonsCollection);
        lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Student lessons fetched:", lessonsData);
        return true;
    } catch (error) {
        console.error("Error fetching lessons for student: ", error);
        showToast("Nepodařilo se načíst data lekcí.", true);
        return false;
    }
}

function renderStudentDashboard() {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
     roleContentWrapper.innerHTML = `
        <div id="dashboard-student" class="w-full flex main-view active">
            <aside class="w-72 bg-white border-r border-slate-200 flex-col p-4 flex-shrink-0 hidden md:flex"></aside>
            <main id="student-content-area" class="flex-grow p-4 sm:p-6 md:p-8 overflow-y-auto bg-slate-50"></main>
        </div>
    `;

    setupStudentNav();
    const mainContent = document.getElementById('student-content-area');

    if (lessonsData.length === 0) {
        mainContent.innerHTML = `<div class="p-8 text-center text-slate-500">Pro vás zatím nebyly připraveny žádné lekce.</div>`;
        return;
    }

    const sortedLessons = [...lessonsData].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    const lessonsHtml = sortedLessons.map(lesson => `
        <div class="bg-white rounded-2xl shadow-lg overflow-hidden mb-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer student-lesson-card" data-lesson-id="${lesson.id}">
            <div class="p-6">
                 <div class="flex items-start justify-between">
                    <div>
                        <p class="text-sm font-semibold text-green-600">${lesson.number || ' '}</p>
                        <h2 class="text-2xl font-bold text-slate-800 mt-1 pointer-events-none">${lesson.title}</h2>
                        <p class="text-slate-500 pointer-events-none">${lesson.subtitle}</p>
                    </div>
                    <span class="text-4xl pointer-events-none">${lesson.icon}</span>
                </div>
            </div>
        </div>`).join('');

    mainContent.innerHTML = `
        <h1 class="text-3xl font-extrabold text-slate-800 mb-6">Váš přehled</h1>
        <div id="telegram-connection-box" class="hidden items-center justify-between bg-sky-100 text-sky-800 p-4 rounded-lg mb-6"></div>
        <h2 class="text-2xl font-bold text-slate-800 mb-4">Dostupné lekce</h2>
        ${lessonsHtml}
    `;

     mainContent.addEventListener('click', (e) => {
        const lessonCard = e.target.closest('.student-lesson-card');
        if (lessonCard) {
            const lessonId = lessonCard.dataset.lessonId;
            const lesson = lessonsData.find(l => l.id === lessonId);
            if (lesson) {
                showStudentLesson(lesson);
            }
        }
    });
}

export async function initStudentDashboard() {
    const lessonsLoaded = await fetchLessons();
    const roleContentWrapper = document.getElementById('role-content-wrapper');

    if (!roleContentWrapper) {
        console.error("role-content-wrapper not found!");
        return;
    }

    if (!lessonsLoaded) {
        roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Chyba při načítání dat. Zkuste prosím obnovit stránku.</div>`;
        return;
    }

    renderStudentDashboard();
}

function setupStudentNav() {
    const nav = document.getElementById('main-nav');
    if (nav) {
        nav.innerHTML = `<li><button class="nav-item p-3 rounded-lg flex items-center justify-center text-white bg-green-600" title="Moje studium"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></button></li>`;
    }
}

async function showStudentLesson(lessonData) {
    console.log("Showing lesson:", lessonData);
    const mainContent = document.getElementById('student-content-area');
    mainContent.innerHTML = `
        <div class="p-4 sm:p-6 md:p-8">
            <button id="back-to-overview-btn" class="mb-6 text-green-700 font-semibold hover:underline">&larr; Zpět na přehled</button>
            <h1 class="text-4xl font-extrabold text-slate-800">${lessonData.title}</h1>
            <p class="text-xl text-slate-500 mb-8">${lessonData.subtitle}</p>
            <div class="prose max-w-none lg:prose-lg">
                ${lessonData.content || '<p>Tato lekce zatím nemá žádný obsah.</p>'}
            </div>
        </div>
    `;

    document.getElementById('back-to-overview-btn').addEventListener('click', () => {
        // Re-render the dashboard instead of just hiding
        renderStudentDashboard();
    });
}