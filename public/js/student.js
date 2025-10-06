// public/js/student.js

import { collection, getDocs, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

// --- MODULE STATE ---
let db;
let auth;
let functions;
let showToast;
let lessonsData = [];

// --- Callable Functions ---
let getLessonKeyTakeaways;
let getAiAssistantResponse;
let sendMessageToProfessor;

export function initializeStudent(appDb, appAuth, appFunctions, appShowToast) {
    db = appDb;
    auth = appAuth;
    functions = appFunctions;
    showToast = appShowToast;

    // Initialize callable functions
    getLessonKeyTakeaways = httpsCallable(functions, 'getLessonKeyTakeaways');
    getAiAssistantResponse = httpsCallable(functions, 'getAiAssistantResponse');
    sendMessageToProfessor = httpsCallable(functions, 'sendMessageToProfessor');
}

async function fetchLessons() {
    try {
        const lessonsCollection = collection(db, 'lessons');
        const querySnapshot = await getDocs(lessonsCollection);
        lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Student lessons fetched:", lessonsData);
    } catch (error) {
        console.error("Error fetching lessons for student:", error);
        showToast("Nepodařilo se načíst lekce.", true);
    }
}

export function setupStudentNav() {
    const nav = document.getElementById('main-nav');
    if (!nav) return;
    nav.innerHTML = `<li><button class="nav-item p-3 rounded-lg flex items-center justify-center text-white bg-green-600" title="Moje studium"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></button></li>`;
}

export async function initStudentDashboard() {
    await fetchLessons();
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    roleContentWrapper.innerHTML = `<div id="dashboard-student" class="w-full flex main-view active"><main id="student-content-area" class="flex-grow p-4 sm:p-6 md:p-8 overflow-y-auto bg-slate-50"></main></div>`;
    const mainContent = document.getElementById('student-content-area');

    if (!mainContent) {
        console.error("Student content area not found.");
        return;
    }

    // Always render the main structure
    mainContent.innerHTML = `
        <div id="telegram-connection-box" class="hidden items-center justify-between p-4 mb-6 bg-sky-100 text-sky-800 rounded-lg shadow">...</div>
        <h1 class="text-3xl font-extrabold text-slate-800 mb-6">Váš přehled</h1>
        <div id="student-lessons-container"></div>
    `;

    // --- Display Telegram Connection Box ---
    displayTelegramConnectionBox();

    const lessonsContainer = document.getElementById('student-lessons-container');
    if (lessonsData.length === 0) {
        lessonsContainer.innerHTML = `<div class="p-8 text-center text-slate-500">Pro vás zatím nebyly připraveny žádné lekce.</div>`;
    } else {
        const sortedLessons = [...lessonsData].sort((a, b) => new Date(b.creationDate) - new Date(a.creationDate));
        lessonsContainer.innerHTML = sortedLessons.map(lesson => `
            <div class="bg-white rounded-2xl shadow-lg mb-6 hover:shadow-xl cursor-pointer student-lesson-card" data-lesson-id="${lesson.id}">
                <div class="p-6">
                    <h2 class="text-2xl font-bold">${lesson.title}</h2>
                    <p class="text-slate-500">${lesson.subtitle}</p>
                </div>
            </div>`).join('');
    }

    mainContent.addEventListener('click', (e) => {
        const lessonCard = e.target.closest('.student-lesson-card');
        if (lessonCard) {
            const lessonId = lessonCard.dataset.lessonId;
            const lesson = lessonsData.find(l => l.id === lessonId);
            if (lesson) showStudentLesson(lesson);
        }
    });
}

async function displayTelegramConnectionBox() {
    const user = auth.currentUser;
    const box = document.getElementById('telegram-connection-box');
    if (!user || !box) return;

    try {
        const studentDoc = await getDoc(doc(db, "students", user.uid));
        if (studentDoc.exists()) {
            const data = studentDoc.data();
            if (data.telegramChatId) {
                box.style.display = 'none';
            } else {
                box.style.display = 'flex';
                const token = data.telegramConnectionToken;
                const botUsername = 'ai_sensei_czu_bot'; // Should be an env var
                if (token) {
                    box.innerHTML = `<span>Propojte se s Telegram botem pro notifikace:</span> <a href="https://t.me/${botUsername}?start=${token}" target="_blank" class="bg-sky-500 text-white font-bold py-2 px-4 rounded">Propojit</a>`;
                } else {
                    box.innerHTML = 'Nepodařilo se načíst propojovací kód.';
                }
            }
        }
    } catch (error) {
        console.error("Error fetching student data for Telegram:", error);
        box.innerHTML = 'Chyba při kontrole stavu propojení.';
    }
}

async function showStudentLesson(lessonData) {
    const mainAppView = document.getElementById('app-container');
    const lessonView = document.getElementById('student-lesson-view');
    mainAppView.classList.add('hidden');
    lessonView.classList.remove('hidden');

    const titleEl = lessonView.querySelector('#student-lesson-title');
    const user = auth.currentUser;
    if (titleEl) titleEl.textContent = lessonData.title;
    if (user) {
        lessonView.querySelector('#student-email-display').textContent = user.email;
        lessonView.querySelector('#student-avatar').textContent = user.email.charAt(0).toUpperCase();
    }

    // Reset view
    const contentContainer = lessonView.querySelector('#student-lesson-content-container');
    contentContainer.querySelector('#tab-text').classList.remove('hidden');
    contentContainer.querySelector('#lesson-text-content').innerHTML = lessonData.content ? lessonData.content.replace(/\n/g, '<br>') : '<p>Žádný text.</p>';

    // Setup tabs
    const tabNav = lessonView.querySelector('nav');
    const newTabNav = tabNav.cloneNode(true);
    tabNav.parentNode.replaceChild(newTabNav, tabNav);
    newTabNav.addEventListener('click', (e) => {
        const button = e.target.closest('.student-lesson-tab-btn');
        if (!button) return;
        const tabId = button.dataset.tab;

        newTabNav.querySelectorAll('.student-lesson-tab-btn').forEach(btn => btn.classList.remove('bg-green-100'));
        button.classList.add('bg-green-100');

        contentContainer.querySelectorAll('.student-lesson-tab-pane').forEach(pane => pane.classList.add('hidden'));
        contentContainer.querySelector(`#tab-${tabId}`).classList.remove('hidden');
    });

    // Back button
    const backBtn = lessonView.querySelector('#back-to-student-dashboard-btn');
    const newBackBtn = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(newBackBtn, backBtn);
    newBackBtn.addEventListener('click', () => {
        lessonView.classList.add('hidden');
        mainAppView.classList.remove('hidden');
    });

    // Initialize interactive components
    initializeKeyTakeaways(lessonData);
    initializeAiAssistant(lessonData);
    initializeProfessorChat(lessonData);
}

function initializeKeyTakeaways(lessonData) {
    const generateBtn = document.querySelector('#generate-takeaways-btn');
    const resultContainer = document.querySelector('#takeaways-result');
    if (!generateBtn || !resultContainer) return;

    const newGenerateBtn = generateBtn.cloneNode(true);
    generateBtn.parentNode.replaceChild(newGenerateBtn, generateBtn);

    newGenerateBtn.addEventListener('click', async () => {
        resultContainer.innerHTML = 'Generuji...';
        try {
            const result = await getLessonKeyTakeaways({ lessonText: lessonData.content });
            resultContainer.innerHTML = result.data.takeaways.replace(/\n/g, '<br>');
        } catch (e) {
            resultContainer.innerHTML = `<p class="text-red-500">Chyba: ${e.message}</p>`;
        }
    });
}

function initializeAiAssistant(lessonData) {
    const sendBtn = document.querySelector('#ai-assistant-send-btn');
    const input = document.querySelector('#ai-assistant-input');
    const historyContainer = document.querySelector('#ai-assistant-chat-history');
    if (!sendBtn || !input || !historyContainer) return;

    const handleSend = async () => {
        const question = input.value.trim();
        if (!question) return;
        // Add user message to UI
        historyContainer.innerHTML += `<div class="chat-bubble-user">${question}</div>`;
        input.value = '';

        try {
            const result = await getAiAssistantResponse({ lessonText: lessonData.content, userQuestion: question });
            // Add AI response to UI
            historyContainer.innerHTML += `<div class="chat-bubble-bot">${result.data.answer.replace(/\n/g, '<br>')}</div>`;
        } catch (e) {
            historyContainer.innerHTML += `<div class="chat-bubble-bot text-red-500">Chyba: ${e.message}</div>`;
        }
    };

    const newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
    newSendBtn.addEventListener('click', handleSend);
}

function initializeProfessorChat(lessonData) {
    const sendBtn = document.querySelector('#student-send-message-btn');
    const input = document.querySelector('#student-chat-input');
    const historyArea = document.querySelector('#chat-history-area');
    if (!sendBtn || !input || !historyArea) return;

    const handleSend = async () => {
        const text = input.value.trim();
        if (!text) return;
        historyArea.innerHTML += `<div class="chat-bubble chat-bubble-user">${text}</div>`;
        input.value = '';

        try {
            await sendMessageToProfessor({ lessonId: lessonData.id, text });
            // Maybe add a confirmation message, but for now, just send-and-forget UI
        } catch (error) {
            alert(`Chyba při odesílání: ${error.message}`);
        }
    };

    const newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
    newSendBtn.addEventListener('click', handleSend);
}