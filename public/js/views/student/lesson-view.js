import { renderAIAssistantChat } from './ai-chat-view.js';
import { renderPodcast } from './podcast-view.js';
import { renderPresentation } from './presentation-view.js';
import { renderProfessorChat } from './professor-chat-view.js';
import { renderQuiz } from './quiz-view.js';
import { renderTest } from './test-view.js';
import { renderVideo } from './video-view.js';
import { renderTelegramPage } from './telegram-view.js';
import { renderOverviewScreen } from './dashboard-view.js';
import { getCurrentUserData, setCurrentLessonId } from '../../student.js';


let currentLessonData = null;

function renderLessonContent(viewId, container) {
    const userData = getCurrentUserData();
    switch(viewId) {
        // --- OPRAVA: Pridaná funkcia .replace() na správne zobrazenie odsekov ---
        case 'text': container.innerHTML = `<div class="prose max-w-none lg:prose-lg">${(currentLessonData.content || '').replace(/\n/g, '<br>')}</div>`; break;
        case 'presentation': renderPresentation(currentLessonData.presentationData, container); break;
        case 'video': renderVideo(currentLessonData.videoUrl, container); break;
        case 'quiz': renderQuiz(currentLessonData, container); break;
        case 'test': renderTest(currentLessonData, container); break;
        case 'post': renderPodcast(currentLessonData.postData, container); break;
        case 'assistant': renderAIAssistantChat(currentLessonData, container); break;
        case 'consultation': renderProfessorChat(currentLessonData, container); break;
        case 'telegram': renderTelegramPage(container, userData); break;
        default: container.innerHTML = `<p>Obsah se připravuje.</p>`;
    }
}

export function showStudentLesson(lessonData) {
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
    
    setCurrentLessonId(lessonData.id);
    currentLessonData = lessonData;

    const studentContentArea = document.getElementById('student-content-area');
    const menuItems = [
        { id: 'text', label: 'Text', icon: '✍️', available: !!lessonData.content },
        { id: 'presentation', label: 'Prezentace', icon: '🖼️', available: !!lessonData.presentationData },
        { id: 'video', label: 'Video', icon: '▶️', available: !!lessonData.videoUrl },
        { id: 'quiz', label: 'Kvíz', icon: '❓', available: !!lessonData.quizData },
        { id: 'test', label: 'Test', icon: '✅', available: !!lessonData.testData },
        { id: 'post', label: 'Podcast', icon: '🎙️', available: !!lessonData.postData },
        { id: 'assistant', label: 'AI Asistent', icon: '🤖', available: true },
        { id: 'consultation', label: 'Konzultace', icon: '💬', available: true },
        { id: 'telegram', label: 'Telegram', icon: '✈️', available: true }
    ];
    const availableMenuItems = menuItems.filter(item => item.available);
    
    const menuHtml = availableMenuItems.map(item => `
        <a href="#" data-view="${item.id}" class="lesson-menu-item p-3 text-sm font-medium border-b-2 border-transparent text-slate-500 md:flex-1 md:text-center">
            ${item.label}
        </a>`).join('');

    studentContentArea.innerHTML = `
        <div class="p-4 sm:p-6 md:p-8">
            <button id="back-to-overview-btn" class="mb-6 text-green-700 font-semibold hover:underline">&larr; Zpět na přehled</button>
            <header class="mb-6 text-center">
                <span class="text-5xl">${lessonData.icon}</span>
                <h1 class="text-3xl md:text-4xl font-extrabold text-slate-800 mt-2">${lessonData.title}</h1>
                <p class="text-lg md:text-xl text-slate-500">${lessonData.subtitle}</p>
            </header>
            
            <div class="border-b border-slate-200 mb-6">
                <nav class="md:flex md:-mb-px scrollable-tabs" id="lesson-tabs-menu">
                    ${menuHtml}
                </nav>
            </div>

            <main id="lesson-content-display" class="bg-white rounded-2xl shadow-lg p-4 sm:p-6 md:p-8 min-h-[400px]"></main>
        </div>
    `;
    
    document.getElementById('back-to-overview-btn').addEventListener('click', () => {
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        setCurrentLessonId(null);
        renderOverviewScreen(); 
    });

    const contentDisplay = document.getElementById('lesson-content-display');
    const tabsMenu = document.getElementById('lesson-tabs-menu');

    tabsMenu.querySelectorAll('.lesson-menu-item').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
            }
            tabsMenu.querySelectorAll('.lesson-menu-item').forEach(i => {
                i.classList.remove('border-green-700', 'text-green-700', 'font-semibold');
                i.classList.add('border-transparent', 'text-slate-500');
            });
            item.classList.add('border-green-700', 'text-green-700', 'font-semibold');
            item.classList.remove('border-transparent', 'text-slate-500');
            renderLessonContent(item.dataset.view, contentDisplay);
        });
    });

    if (availableMenuItems.length > 0) {
        tabsMenu.querySelector('.lesson-menu-item').click();
    } else {
        contentDisplay.innerHTML = `<p class="text-center text-slate-500 p-8">Pro tuto lekci zatím není k dispozici žádný obsah.</p>`;
    }
}
