import { db } from './firebase-init.js';
import { collection, query, where, getDocs, orderBy, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { setupStudentNav } from './views/student/navigation.js';
import { renderDashboard } from './views/student/dashboard-view.js';
import { renderLesson } from './views/student/lesson-view.js';
import { renderQuiz } from './views/student/quiz-view.js';
import { renderTest } from './views/student/test-view.js';
import { renderPodcast } from './views/student/podcast-view.js';
import { renderPresentation } from './views/student/presentation-view.js';
import { renderVideo } from './views/student/video-view.js';
import { renderAIChat } from './views/student/ai-chat-view.js';
import { renderProfessorChat } from './views/student/professor-chat-view.js';
import { renderTelegram } from './views/student/telegram-view.js';

let currentLessonId = null;

export function setCurrentLessonId(lessonId) {
    currentLessonId = lessonId;
}

// --- OPRAVA: Pridané kľúčové slovo "export" ---
export async function showStudentContent(view, studentData) {
    const mainContentArea = document.getElementById('main-content-area');
    if (!mainContentArea) {
        console.error("main-content-area not found");
        return;
    }

    // Odstránenie predchádzajúcich listenerov, ak nejaké existujú
    const oldContent = mainContentArea.firstChild;
    if (oldContent && oldContent.stopListeners) {
        oldContent.stopListeners();
    }

    switch (view) {
        case 'lesson':
            if (currentLessonId) {
                renderLesson(mainContentArea, db, currentLessonId);
            } else {
                mainContentArea.innerHTML = '<p>Nejprve vyberte lekci z přehledu.</p>';
            }
            break;
        case 'quiz':
            renderQuiz(mainContentArea, db, currentLessonId);
            break;
        case 'test':
            renderTest(mainContentArea, db, currentLessonId);
            break;
        case 'podcast':
            renderPodcast(mainContentArea, db, currentLessonId);
            break;
        case 'presentation':
            renderPresentation(mainContentArea, db, currentLessonId);
            break;
        case 'video':
            renderVideo(mainContentArea, db, currentLessonId);
            break;
        case 'chat':
            renderAIChat(mainContentArea, studentData);
            break;
        case 'professor-chat':
            renderProfessorChat(mainContentArea, db, studentData);
            break;
        case 'telegram':
            renderTelegram(mainContentArea);
            break;
        case 'overview':
        default:
            renderDashboard(mainContentArea, db, studentData);
            break;
    }
}

export async function initStudentDashboard(studentData) {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    roleContentWrapper.innerHTML = `
        <div id="dashboard-student" class="w-full flex main-view active h-screen">
            <main id="main-content-area" class="flex-grow bg-slate-50 flex flex-col h-screen"></main>
        </div>
    `;
    
    setupStudentNav(studentData);
    
    // Zobrazenie úvodného prehľadu
    showStudentContent('overview', studentData);
}
