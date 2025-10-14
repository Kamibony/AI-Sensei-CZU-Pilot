import { renderQuiz } from './quiz-view.js';
import { renderTest } from './test-view.js';
import { renderPodcast } from './podcast-view.js';
import { renderPresentation } from './presentation-view.js';
import { renderVideo } from './video-view.js';
// --- OPRAVA: Zmenený názov z 'renderAIAssistantChat' na správny 'renderAIChat' ---
import { renderAIChat } from './ai-chat-view.js';
import { renderProfessorChat } from './professor-chat-view.js';
import { showStudentContent, getCurrentUserData } from '../../student.js';
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function renderLesson(container, db, lessonId) {
    const studentData = getCurrentUserData();
    if (!studentData) {
        container.innerHTML = `<p class="p-4 text-red-500">Chyba: Informace o studentovi nebyly nalezeny.</p>`;
        return;
    }

    try {
        const lessonRef = doc(db, 'lessons', lessonId);
        const lessonSnap = await getDoc(lessonRef);

        if (!lessonSnap.exists()) {
            container.innerHTML = `<p>Lekce nebyla nalezena.</p>`;
            return;
        }

        const lesson = { id: lessonSnap.id, ...lessonSnap.data() };
        
        const activitiesRef = collection(db, 'lessons', lessonId, 'activities');
        const activitiesSnap = await getDocs(activitiesRef);
        const activities = activitiesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const activityButtons = {
            'quiz': 'Kvíz',
            'test': 'Test',
            'podcast': 'Podcast',
            'presentation': 'Prezentace',
            'video': 'Video',
        };

        let activitiesHtml = `
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <button class="activity-btn" data-type="chat">
                    <span class="font-semibold">Chat s AI</span>
                    <span class="text-xs text-slate-500">K této lekci</span>
                </button>
                <button class="activity-btn" data-type="professor-chat">
                    <span class="font-semibold">Zeptat se</span>
                    <span class="text-xs text-slate-500">Profesora</span>
                </button>
                ${activities.map(activity => `
                    <button class="activity-btn" data-type="${activity.id}">
                        <span class="font-semibold">${activityButtons[activity.id] || activity.type}</span>
                        <span class="text-xs text-slate-500">Spustit aktivitu</span>
                    </button>
                `).join('')}
            </div>
        `;

        container.innerHTML = `
            <div class="p-4 md:p-6">
                <div class="max-w-4xl mx-auto">
                    <div class="bg-white rounded-2xl shadow-lg overflow-hidden">
                        <div class="p-6 md:p-8">
                            <header class="mb-6 border-b pb-6">
                                <button id="back-to-dashboard-btn" class="mb-4 inline-flex items-center text-sm font-semibold text-green-700 hover:text-green-800">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                                    Zpět na přehled
                                </button>
                                <h1 class="text-3xl md:text-4xl font-extrabold text-slate-800 tracking-tight">${lesson.title}</h1>
                                <p class="text-lg text-slate-500 mt-2">${lesson.subtitle || ''}</p>
                            </header>
                            <article class="prose prose-lg max-w-none text-slate-600">
                                ${lesson.content}
                            </article>
                        </div>
                        <footer class="bg-slate-50 p-6 md:p-8 border-t">
                            <h3 class="text-xl font-bold text-slate-700 mb-4">Dostupné aktivity</h3>
                            ${activitiesHtml}
                        </footer>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('back-to-dashboard-btn').addEventListener('click', () => {
            showStudentContent('overview');
        });

        container.querySelectorAll('.activity-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                showStudentContent(type);
            });
        });

    } catch (error) {
        console.error("Error rendering lesson:", error);
        container.innerHTML = `<p class="p-4 text-red-500">Chyba při načítání lekce.</p>`;
    }
}
