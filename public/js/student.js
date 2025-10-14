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
let currentUserData = null; // OPRAVA: Premenná na uloženie dát o študentovi

// OPRAVA: Nová exportovaná funkcia na získanie dát o študentovi
export function getCurrentUserData() {
    return currentUserData;
}

export function setCurrentLessonId(lessonId) {
    currentLessonId = lessonId;
}

export async function showStudentContent(view) {
    const mainContentArea = document.getElementById('main-content-area');
    if (!mainContentArea) {
        console.error("main-content-area not found");
        return;
    }

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
            renderAIChat(mainContentArea, currentUserData); // Použije sa uložený používateľ
            break;
        case 'professor-chat':
            renderProfessorChat(mainContentArea, db, currentUserData); // Použije sa uložený používateľ
            break;
        case 'telegram':
            renderTelegram(mainContentArea);
            break;
        case 'overview':
        default:
            renderDashboard(mainContentArea, db, currentUserData); // Použije sa uložený používateľ
            break;
    }
}

export async function initStudentDashboard(studentData) {
    currentUserData = studentData; // OPRAVA: Uložíme dáta o prihlásenom študentovi

    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    roleContentWrapper.innerHTML = `
        <div id="dashboard-student" class="w-full flex main-view active h-screen">
            <main id="main-content-area" class="flex-grow bg-slate-50 flex flex-col h-screen"></main>
        </div>
    `;
    
    setupStudentNav(studentData);
    
    showStudentContent('overview');
}
