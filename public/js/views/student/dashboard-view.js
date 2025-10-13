import { collection, getDocs, doc, query, where, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from '../../utils.js';
import { db, auth } from '../../firebase-init.js';
import { setupStudentNav } from './navigation.js';
import { showStudentLesson } from './lesson-view.js';

let lessonsData = [];

// --- OPRAVA: Pridané kľúčové slovo "export" ---
export function promptForStudentName(userId) {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;
    roleContentWrapper.innerHTML = `
        <div class="flex items-center justify-center h-screen bg-slate-50">
            <div class="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md text-center">
                <h1 class="text-2xl font-bold text-slate-800 mb-4">Vítejte v AI Sensei!</h1>
                <p class="text-slate-600 mb-6">Prosím, zadejte své jméno, abychom věděli, jak vás oslovovat.</p>
                <input type="text" id="student-name-input" placeholder="Vaše jméno a příjmení" class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                <button id="save-name-btn" class="w-full mt-4 bg-green-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-800 transition-colors">Uložit a pokračovat</button>
            </div>
        </div>
    `;
    document.getElementById('save-name-btn').addEventListener('click', async () => {
        const nameInput = document.getElementById('student-name-input');
        const name = nameInput.value.trim();
        if (!name) {
            showToast('Jméno nemůže být prázdné.', true);
            return;
        }
        try {
            const studentRef = doc(db, 'students', userId);
            await updateDoc(studentRef, { name: name });
            showToast('Jméno úspěšně uloženo!');
        } catch (error) {
            console.error("Error saving student name:", error);
            showToast('Nepodařilo se uložit jméno.', true);
        }
    });
}

async function fetchLessons() {
    try {
        const timelineCollection = collection(db, 'timeline_events');
        const timelineQuery = query(timelineCollection, orderBy("orderIndex"));
        const timelineSnapshot = await getDocs(timelineQuery);
        const scheduledLessonIds = timelineSnapshot.docs.map(doc => doc.data().lessonId);
        const uniqueLessonIds = [...new Set(scheduledLessonIds)];

        if (uniqueLessonIds.length === 0) {
            lessonsData = [];
            return true;
        }

        const lessonsCollection = collection(db, 'lessons');
        const lessonsQuery = query(lessonsCollection, where("__name__", "in", uniqueLessonIds));
        const lessonsSnapshot = await getDocs(lessonsQuery);
        const lessonsMap = new Map(lessonsSnapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }]));
        lessonsData = uniqueLessonIds.map(id => lessonsMap.get(id)).filter(Boolean);

        return true;
    } catch (error) {
        console.error("Error fetching scheduled lessons for student:", error);
        showToast("Nepodařilo se načíst data lekcí.", true);
        return false;
    }
}

function renderStudentDashboard(container) {
    let lessonsContent;
    if (lessonsData.length === 0) {
        lessonsContent = `<div class="p-8 text-center text-slate-500">Profesor zatiaľ nenaplánoval žiadne lekcie.</div>`;
    } else {
        const lessonsHtml = lessonsData.map(lesson => `
            <div class="bg-white rounded-2xl shadow-lg overflow-hidden mb-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer student-lesson-card" data-lesson-id="${lesson.id}">
                <div class="p-6">
                    <div class="flex items-start justify-between">
                        <div>
                            <p class="text-sm font-semibold text-green-600">${lesson.number || ' '}</p>
                            <h2 class="text-2xl font-bold text-slate-800 mt-1">${lesson.title}</h2>
                            <p class="text-slate-500">${lesson.subtitle}</p>
                        </div>
                        <span class="text-4xl">${lesson.icon}</span>
                    </div>
                </div>
            </div>`).join('');
        lessonsContent = `<h2 class="text-2xl font-bold text-slate-800 mb-4">Dostupné lekce</h2>${lessonsHtml}`;
    }
    
    container.innerHTML = `
        <div class="p-4 sm:p-6 md:p-8">
            <h1 class="text-3xl md:text-4xl font-extrabold text-slate-800 mb-6">Váš přehled</h1>
            ${lessonsContent}
        </div>
    `;
    
    container.querySelectorAll('.student-lesson-card').forEach(card => {
        card.addEventListener('click', () => {
            const lessonId = card.dataset.lessonId;
            const lesson = lessonsData.find(l => l.id === lessonId);
            if (lesson) {
                updateDoc(doc(db, 'students', auth.currentUser.uid), { lastActiveLessonId: lessonId });
                showStudentLesson(lesson);
            }
        });
    });
}

export async function renderOverviewScreen() {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    await setupStudentNav();
    const lessonsFetched = await fetchLessons();
    if (lessonsFetched) {
        roleContentWrapper.innerHTML = `<div id="student-content-area" class="flex-grow overflow-y-auto bg-slate-50 h-full"></div>`;
        const studentContentArea = document.getElementById('student-content-area');
        renderStudentDashboard(studentContentArea);
    }
}
