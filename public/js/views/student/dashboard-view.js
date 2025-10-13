import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from '../../utils.js';
import { db, auth } from '../../firebase-init.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function fetchLessons() {
    try {
        const timelineCollection = collection(db, 'timeline_events');
        const timelineQuery = query(timelineCollection, orderBy("orderIndex"));
        const timelineSnapshot = await getDocs(timelineQuery);
        const scheduledLessonIds = timelineSnapshot.docs.map(doc => doc.data().lessonId);
        const uniqueLessonIds = [...new Set(scheduledLessonIds)];

        if (uniqueLessonIds.length === 0) {
            return [];
        }

        const lessonsCollection = collection(db, 'lessons');
        const lessonsQuery = query(lessonsCollection, where("__name__", "in", uniqueLessonIds));
        const lessonsSnapshot = await getDocs(lessonsQuery);
        const lessonsMap = new Map(lessonsSnapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }]));
        const lessonsData = uniqueLessonIds.map(id => lessonsMap.get(id)).filter(Boolean);

        return lessonsData;
    } catch (error) {
        console.error("Error fetching scheduled lessons for student:", error);
        showToast("Nepodařilo se načíst data lekcí.", true);
        return null;
    }
}

export function renderStudentDashboard(container, lessonsData, showStudentLesson) {
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