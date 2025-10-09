import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
import { db, auth } from './firebase-init.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from './firebase-init.js';

let lessonsData = [];
const getLessonKeyTakeaways = httpsCallable(functions, 'getLessonKeyTakeaways');
const getAiAssistantResponse = httpsCallable(functions, 'getAiAssistantResponse');
const sendMessageToProfessor = httpsCallable(functions, 'sendMessageToProfessor');

async function fetchLessons() {
    try {
        const lessonsCollection = collection(db, 'lessons');
        const querySnapshot = await getDocs(lessonsCollection);
        lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return true;
    } catch (error) {
        console.error("Error fetching lessons:", error);
        showToast("Nepodařilo se načíst data lekcí.", true);
        return false;
    }
}

function renderStudentDashboard(container) {
    let lessonsContent;
    if (lessonsData.length === 0) {
        lessonsContent = `<div class="p-8 text-center text-slate-500">Pro vás zatím nebyly připraveny žádné lekce.</div>`;
    } else {
        const sortedLessons = [...lessonsData].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        const lessonsHtml = sortedLessons.map(lesson => `
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
        lessonsContent = `
            <h2 class="text-2xl font-bold text-slate-800 mb-4">Dostupné lekce</h2>
            ${lessonsHtml}
        `;
    }

    container.innerHTML = `
        <h1 class="text-3xl font-extrabold text-slate-800 mb-6">Váš přehled</h1>
        ${lessonsContent}
    `;
}

export async function initStudentDashboard() {
    await fetchLessons();
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;
    
    roleContentWrapper.innerHTML = `<main id="student-content-area" class="flex-grow p-4 sm:p-6 md:p-8 overflow-y-auto bg-slate-50"></main>`;
    const studentContentArea = document.getElementById('student-content-area');

    renderStudentDashboard(studentContentArea);

    studentContentArea.addEventListener('click', (e) => {
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

function showStudentLesson(lessonData) {
    const studentContentArea = document.getElementById('student-content-area');
    studentContentArea.innerHTML = `
        <div class="p-4 sm:p-6 md:p-8">
            <button id="back-to-overview-btn" class="mb-6 text-green-700 font-semibold hover:underline">&larr; Zpět na přehled</button>
            <header class="mb-8">
                <span class="text-5xl">${lessonData.icon}</span>
                <h1 class="text-4xl font-extrabold text-slate-800 mt-2">${lessonData.title}</h1>
                <p class="text-xl text-slate-500">${lessonData.subtitle}</p>
                 <div class="w-full bg-gray-200 rounded-full h-2.5 mt-4">
                    <div id="lesson-progress-bar" class="bg-green-600 h-2.5 rounded-full" style="width: 0%"></div>
                </div>
            </header>
            
            <nav class="flex space-x-1 border-b mb-6">
                <button data-tab="text" class="student-lesson-tab-btn px-4 py-2 font-semibold text-slate-500 border-b-2 border-transparent hover:text-green-600">Text lekce</button>
                <button data-tab="takeaways" class="student-lesson-tab-btn px-4 py-2 font-semibold text-slate-500 border-b-2 border-transparent hover:text-green-600">Klíčové body</button>
                <button data-tab="assistant" class="student-lesson-tab-btn px-4 py-2 font-semibold text-slate-500 border-b-2 border-transparent hover:text-green-600">AI Asistent</button>
            </nav>
            
            <div id="student-lesson-content-container">
                <div id="tab-text" class="student-lesson-tab-pane"></div>
                <div id="tab-takeaways" class="student-lesson-tab-pane hidden"></div>
                <div id="tab-assistant" class="student-lesson-tab-pane hidden"></div>
            </div>
        </div>
    `;

    // Renderovanie obsahu
    document.getElementById('tab-text').innerHTML = lessonData.content ? `<div class="prose max-w-none lg:prose-lg">${lessonData.content}</div>` : '<p>Žiadny obsah.</p>';
    initializeKeyTakeaways(document.getElementById('tab-takeaways'), lessonData);
    initializeAiAssistant(document.getElementById('tab-assistant'), lessonData);
    
    // Logika pre taby
    const tabs = studentContentArea.querySelectorAll('.student-lesson-tab-btn');
    const panes = studentContentArea.querySelectorAll('.student-lesson-tab-pane');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('border-green-600', 'text-green-600'));
            tab.classList.add('border-green-600', 'text-green-600');
            panes.forEach(p => p.classList.add('hidden'));
            document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
        });
    });
    tabs[0].click(); // Activate first tab

    document.getElementById('back-to-overview-btn').addEventListener('click', () => {
        renderStudentDashboard(studentContentArea);
    });
}

function initializeKeyTakeaways(container, lessonData) {
    container.innerHTML = `
        <button id="generate-takeaways-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900">Vygenerovat klíčové body</button>
        <div id="takeaways-result" class="mt-4"></div>
    `;
    
    container.querySelector('#generate-takeaways-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const resultContainer = container.querySelector('#takeaways-result');
        btn.disabled = true;
        btn.textContent = 'Generuji...';
        try {
            const result = await getLessonKeyTakeaways({ lessonText: lessonData.content });
            resultContainer.innerHTML = `<div class="prose max-w-none">${result.data.takeaways.replace(/\n/g, '<br>')}</div>`;
        } catch (error) {
            resultContainer.innerHTML = `<p class="text-red-500">Chyba: ${error.message}</p>`;
        } finally {
            btn.disabled = false;
            btn.textContent = 'Vygenerovat znovu';
        }
    });
}

function initializeAiAssistant(container, lessonData) {
    container.innerHTML = `
        <div id="ai-assistant-chat-history" class="h-96 overflow-y-auto border rounded-lg p-4 mb-4"></div>
        <div class="flex gap-2">
            <input id="ai-assistant-input" type="text" class="flex-grow border-slate-300 rounded-lg" placeholder="Zeptejte se na něco k lekci...">
            <button id="ai-assistant-send-btn" class="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Odeslat</button>
        </div>
    `;

    const sendBtn = container.querySelector('#ai-assistant-send-btn');
    const input = container.querySelector('#ai-assistant-input');
    const historyContainer = container.querySelector('#ai-assistant-chat-history');
    
    const addMessage = (text, sender) => {
        const div = document.createElement('div');
        div.textContent = `${sender}: ${text}`;
        historyContainer.appendChild(div);
        historyContainer.scrollTop = historyContainer.scrollHeight;
    };

    sendBtn.addEventListener('click', async () => {
        const userQuestion = input.value.trim();
        if (!userQuestion) return;
        addMessage(userQuestion, 'Vy');
        input.value = '';
        try {
            const result = await getAiAssistantResponse({ lessonText: lessonData.content, userQuestion });
            addMessage(result.data.answer, 'AI Asistent');
        } catch (error) {
            addMessage(`Chyba: ${error.message}`, 'Systém');
        }
    });
}
