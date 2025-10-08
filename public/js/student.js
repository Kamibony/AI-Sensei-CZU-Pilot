import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { showToast } from './utils.js';
import { db, auth, functions } from './firebase-init.js';

let lessonsData = [];

// --- CALLABLE FUNCTIONS INITIALIZATION ---
const sendMessageToProfessor = httpsCallable(functions, 'sendMessageToProfessor');
const getLessonKeyTakeaways = httpsCallable(functions, 'getLessonKeyTakeaways');
const getAiAssistantResponse = httpsCallable(functions, 'getAiAssistantResponse');


async function fetchLessons() {
    try {
        const lessonsCollection = collection(db, 'lessons');
        const querySnapshot = await getDocs(lessonsCollection);
        lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return true;
    } catch (error) {
        console.error("Error fetching lessons for student: ", error);
        showToast("Nepodařilo se načíst data lekcí.", true);
        return false;
    }
}

export async function initStudentDashboard() {
    const lessonsLoaded = await fetchLessons();
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    if (!lessonsLoaded) {
        roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Chyba při načítání dat.</div>`;
        return;
    }

    roleContentWrapper.innerHTML = `
        <div id="dashboard-student" class="w-full flex main-view active">
            <aside class="w-72 bg-white border-r border-slate-200 flex-col p-4 flex-shrink-0 hidden md:flex"></aside>
            <main id="student-content-area" class="flex-grow p-4 sm:p-6 md:p-8 overflow-y-auto bg-slate-50"></main>
        </div>`;

    setupStudentNav();
    renderStudentDashboardUI();
}

function setupStudentNav() {
    const nav = document.getElementById('main-nav');
    if (nav) {
        nav.innerHTML = `<li><button class="nav-item p-3 rounded-lg flex items-center justify-center text-white bg-green-600" title="Moje studium"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></button></li>`;
    }
}

async function renderStudentDashboardUI() {
    const mainContent = document.getElementById('student-content-area');
    if (!mainContent) return;

    const sortedLessons = [...lessonsData].sort((a, b) => new Date(b.creationDate) - new Date(a.creationDate));

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
                <div class="mt-4 pt-4 border-t border-slate-200 prose prose-sm max-w-none text-slate-600 pointer-events-none">
                    ${lesson.content ? lesson.content.substring(0, 150) + '...' : 'Tato lekce zatím nemá žádný obsah.'}
                </div>
            </div>
        </div>`).join('');

    mainContent.innerHTML = `
        <h1 class="text-3xl font-extrabold text-slate-800 mb-6">Váš přehled</h1>
        <div id="telegram-connection-box" class="hidden items-center justify-between bg-sky-100 text-sky-800 p-4 rounded-lg mb-6">
            <p>Propojte si účet s Telegramem pro lepší interakci!</p>
            <div id="telegram-link-container"></div>
        </div>
        <h2 class="text-2xl font-bold text-slate-800 mb-4">Dostupné lekce</h2>
        ${lessonsData.length > 0 ? lessonsHtml : '<p class="text-slate-500">Pro vás zatím nebyly připraveny žádné lekce.</p>'}
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

    await displayTelegramConnection();
}

async function displayTelegramConnection() {
    const user = auth.currentUser;
    const telegramConnectionBox = document.getElementById('telegram-connection-box');
    const telegramLinkContainer = document.getElementById('telegram-link-container');

    if (user && telegramConnectionBox && telegramLinkContainer) {
        try {
            const studentDocRef = doc(db, "students", user.uid);
            const studentDoc = await getDoc(studentDocRef);

            if (studentDoc.exists()) {
                const studentData = studentDoc.data();
                if (studentData.telegramChatId) {
                    telegramConnectionBox.style.display = 'none';
                } else {
                    telegramConnectionBox.style.display = 'flex';
                    const token = studentData.telegramConnectionToken;
                    const botUsername = 'ai_sensei_czu_bot'; // Placeholder
                    if (token) {
                        const connectionLink = `https://t.me/${botUsername}?start=${token}`;
                        telegramLinkContainer.innerHTML = `<a href="${connectionLink}" target="_blank" rel="noopener noreferrer" class="inline-block bg-sky-500 text-white font-bold py-2 px-4 rounded hover:bg-sky-600 transition-colors shadow">Propojit</a>`;
                    } else {
                        telegramLinkContainer.innerHTML = '<p class="italic text-red-600">Chyba kódu.</p>';
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching student data for Telegram:", error);
            showToast("Chyba při načítání stavu Telegramu.", true);
        }
    }
}

// --- Helper functions for rendering specific content types ---
function renderQuiz(quizData, container) {
    if (!quizData || !quizData.questions || quizData.questions.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-center">Pro tuto lekci není k dispozici žádný kvíz.</p>';
        return;
    }

    const questionsHtml = quizData.questions.map((q, index) => {
        const optionsHtml = q.options.map((option, i) => `
            <label class="block p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input type="radio" name="question-${index}" value="${i}" class="mr-3 accent-green-600">
                <span>${option}</span>
            </label>
        `).join('');

        return `
            <div class="bg-white p-6 rounded-lg shadow-md mb-6" data-question-index="${index}">
                <p class="font-semibold text-lg text-slate-800 mb-4">${index + 1}. ${q.question_text}</p>
                <div class="space-y-3">${optionsHtml}</div>
                <div class="mt-4 p-3 rounded-lg text-sm font-medium hidden result-feedback"></div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <h2 class="text-3xl font-extrabold text-slate-800 mb-6 text-center">Interaktivní Kvíz</h2>
        <form id="quiz-form">${questionsHtml}</form>
        <div class="text-center mt-6">
            <button id="check-quiz-btn" class="bg-green-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-green-700 transition-all transform hover:scale-105 shadow-lg">Vyhodnotit kvíz</button>
        </div>
        <div id="quiz-summary" class="hidden mt-8 text-center font-bold text-xl p-4 bg-yellow-100 text-yellow-800 rounded-lg"></div>
    `;

    document.getElementById('check-quiz-btn').addEventListener('click', () => {
        let score = 0;
        const form = document.getElementById('quiz-form');
        quizData.questions.forEach((q, index) => {
            const questionEl = form.querySelector(`[data-question-index="${index}"]`);
            const feedbackEl = questionEl.querySelector('.result-feedback');
            const selected = form.querySelector(`input[name="question-${index}"]:checked`);

            feedbackEl.classList.remove('hidden', 'bg-green-100', 'text-green-700', 'bg-red-100', 'text-red-700');

            if (selected) {
                if (parseInt(selected.value) === q.correct_option_index) {
                    score++;
                    feedbackEl.textContent = 'Správně!';
                    feedbackEl.classList.add('bg-green-100', 'text-green-700');
                } else {
                    feedbackEl.textContent = `Špatně. Správná odpověď byla: ${q.options[q.correct_option_index]}`;
                    feedbackEl.classList.add('bg-red-100', 'text-red-700');
                }
            } else {
                feedbackEl.textContent = 'Nevybrali jste žádnou odpověď.';
                feedbackEl.classList.add('bg-red-100', 'text-red-700');
            }
             feedbackEl.classList.remove('hidden');
        });

        const summaryEl = document.getElementById('quiz-summary');
        summaryEl.textContent = `Vaše skóre: ${score} z ${quizData.questions.length}`;
        summaryEl.classList.remove('hidden');
        document.getElementById('check-quiz-btn').disabled = true;
    });
}

function renderPresentation(presentationData, container) {
    if (!presentationData || !presentationData.slides || presentationData.slides.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-center">Pro tuto lekci není k dispozici žádná prezentace.</p>';
        return;
    }

    let currentSlide = 0;

    const render = () => {
        const slide = presentationData.slides[currentSlide];
        const slidesHtml = `
             <h2 class="text-3xl font-extrabold text-slate-800 mb-6 text-center">Prezentace</h2>
            <div class="bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col h-[70vh] max-w-4xl mx-auto">
                <div class="bg-slate-700 text-white p-4 text-center">
                    <h3 class="text-2xl font-bold">${slide.title}</h3>
                </div>
                <div class="p-8 flex-grow overflow-y-auto">
                    <ul class="list-disc list-inside space-y-4 text-xl text-slate-700">
                        ${slide.points.map(p => `<li>${p}</li>`).join('')}
                    </ul>
                </div>
                <div class="p-4 bg-slate-100 border-t flex justify-between items-center flex-shrink-0">
                    <button id="prev-slide-btn" class="px-4 py-2 bg-slate-300 rounded-lg hover:bg-slate-400 disabled:opacity-50 disabled:cursor-not-allowed font-semibold">Předchozí</button>
                    <span class="font-semibold text-slate-600">${currentSlide + 1} / ${presentationData.slides.length}</span>
                    <button id="next-slide-btn" class="px-4 py-2 bg-slate-300 rounded-lg hover:bg-slate-400 disabled:opacity-50 disabled:cursor-not-allowed font-semibold">Další</button>
                </div>
            </div>
        `;
        container.innerHTML = slidesHtml;

        const prevBtn = document.getElementById('prev-slide-btn');
        const nextBtn = document.getElementById('next-slide-btn');

        prevBtn.disabled = currentSlide === 0;
        nextBtn.disabled = currentSlide === presentationData.slides.length - 1;

        const newPrevBtn = prevBtn.cloneNode(true);
        prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
        newPrevBtn.addEventListener('click', () => {
            if (currentSlide > 0) {
                currentSlide--;
                render();
            }
        });

        const newNextBtn = nextBtn.cloneNode(true);
        nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
        newNextBtn.addEventListener('click', () => {
            if (currentSlide < presentationData.slides.length - 1) {
                currentSlide++;
                render();
            }
        });
    };

    render();
}


export async function showStudentLesson(lessonData) {
    const mainAppView = document.getElementById('app-container');
    const lessonView = document.getElementById('student-lesson-view');
    const aiAssistantBtn = document.getElementById('ai-assistant-btn');

    if (!mainAppView || !lessonView || !lessonData) return;

    const lessonId = lessonData.id;
    const visitedTabs = new Set();
    let totalTabs = 3; // Takeaways, Assistant, Chat

    mainAppView.classList.add('hidden');
    if (aiAssistantBtn) aiAssistantBtn.style.display = 'none';
    lessonView.classList.remove('hidden');

    const titleEl = lessonView.querySelector('#student-lesson-title');
    const progressBar = lessonView.querySelector('#lesson-progress-bar');
    const tabNav = lessonView.querySelector('nav');
    const contentContainer = lessonView.querySelector('#student-lesson-content-container');

    const user = auth.currentUser;
    if (user) {
        lessonView.querySelector('#student-email-display').textContent = user.email;
        lessonView.querySelector('#student-avatar').textContent = user.email.charAt(0).toUpperCase();
    }

    titleEl.textContent = 'Načítání...';
    progressBar.style.width = '0%';
    contentContainer.querySelectorAll('.student-lesson-tab-pane').forEach(pane => {
        pane.innerHTML = '<div class="p-8 text-center pulse-loader text-slate-500">Načítání...</div>';
    });

    const updateProgressBar = () => {
        const progress = totalTabs > 0 ? Math.min((visitedTabs.size / totalTabs) * 100, 100) : 0;
        progressBar.style.width = `${progress}%`;
    };

    const newTabNav = tabNav.cloneNode(true);
    tabNav.parentNode.replaceChild(newTabNav, tabNav);
    newTabNav.addEventListener('click', (e) => {
        const button = e.target.closest('.student-lesson-tab-btn');
        if (!button) return;
        const tabId = button.dataset.tab;

        newTabNav.querySelectorAll('.student-lesson-tab-btn').forEach(btn => {
            btn.classList.remove('bg-green-100', 'text-green-800');
            btn.classList.add('text-slate-600', 'hover:bg-slate-100');
        });
        button.classList.add('bg-green-100', 'text-green-800');
        button.classList.remove('text-slate-600', 'hover:bg-slate-100');

        contentContainer.querySelectorAll('.student-lesson-tab-pane').forEach(pane => {
            pane.classList.add('hidden');
        });
        contentContainer.querySelector(`#tab-${tabId}`).classList.remove('hidden');

        if (!visitedTabs.has(tabId)) {
            visitedTabs.add(tabId);
            updateProgressBar();
        }
    });

    try {
        titleEl.textContent = lessonData.title;

        const tabConfig = {
            'text': { data: lessonData.content, container: '#lesson-text-content', renderer: (data, el) => { el.innerHTML = data ? data.replace(/\n/g, '<br>') : '<p>Pro tuto lekci není k dispozici žádný text.</p>'; } },
            'video': { data: lessonData.videoUrl, container: '#lesson-video-content', renderer: (data, el) => { const videoId = data.split('v=')[1]?.split('&')[0]; el.innerHTML = videoId ? `<iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen class="w-full h-full"></iframe>` : '<p class="text-white">Neplatná adresa videa.</p>'; } },
            'presentation': { data: lessonData.presentationData, container: '#lesson-presentation-content', renderer: renderPresentation },
            'quiz': { data: lessonData.quizData, container: '#lesson-quiz-content', renderer: renderQuiz },
        };

        totalTabs = 3;
        let firstAvailableTab = null;

        for (const tabName in tabConfig) {
            const config = tabConfig[tabName];
            const tabBtn = newTabNav.querySelector(`[data-tab="${tabName}"]`);

            if (config.data) {
                tabBtn.style.display = 'flex';
                totalTabs++;
                if (!firstAvailableTab) firstAvailableTab = tabName;
                config.renderer(config.data, contentContainer.querySelector(config.container));
            } else {
                tabBtn.style.display = 'none';
            }
        }

        initializeKeyTakeaways(lessonData);
        initializeAiAssistant(lessonData);
        initializeProfessorChat(lessonData);

        if (firstAvailableTab) {
            newTabNav.querySelector(`[data-tab="${firstAvailableTab}"]`).click();
        } else {
            newTabNav.querySelector('[data-tab="takeaways"]').click();
        }
        updateProgressBar();

    } catch (error) {
        console.error("Error populating student lesson view:", error);
        showToast("Při zobrazování lekce došlo k chybě.", true);
    }
}

function initializeKeyTakeaways(lessonData) {
    const contentContainer = document.getElementById('student-lesson-content-container');
    const generateBtn = contentContainer.querySelector('#generate-takeaways-btn');
    const resultContainer = contentContainer.querySelector('#takeaways-result');
    const clickHandler = async () => {
        generateBtn.disabled = true;
        generateBtn.innerHTML = `<div class="spinner"></div><span class="ml-2">Generuji...</span>`;
        resultContainer.innerHTML = '';
        try {
            const result = await getLessonKeyTakeaways({ lessonText: lessonData.content });
            resultContainer.innerHTML = `<div class="bg-yellow-50 border border-yellow-200 p-6 rounded-lg">${result.data.takeaways.replace(/\n/g, '<br>')}</div>`;
        } catch (e) {
            resultContainer.innerHTML = `<p class="text-red-500">Nepodařilo se vygenerovat klíčové body: ${e.message}</p>`;
        } finally {
            generateBtn.disabled = false;
            generateBtn.innerHTML = `<i class="fas fa-wand-magic-sparkles mr-2"></i>Vygenerovat znovu`;
        }
    };
    generateBtn.replaceWith(generateBtn.cloneNode(true));
    contentContainer.querySelector('#generate-takeaways-btn').addEventListener('click', clickHandler);
}

function initializeAiAssistant(lessonData) {
    const contentContainer = document.getElementById('student-lesson-content-container');
    const sendBtn = contentContainer.querySelector('#ai-assistant-send-btn');
    const input = contentContainer.querySelector('#ai-assistant-input');
    const historyContainer = contentContainer.querySelector('#ai-assistant-chat-history');
    const user = auth.currentUser;

    const addMessageToHistory = (text, sender) => {
        const bubble = document.createElement('div');
        if (sender === 'user') {
            bubble.className = 'flex gap-3 items-start justify-end';
            bubble.innerHTML = `<div class="bg-green-600 text-white p-3 rounded-lg rounded-br-none"><p>${text}</p></div><div class="w-8 h-8 bg-blue-200 text-blue-800 rounded-full flex items-center justify-center flex-shrink-0 font-bold">${user.email.charAt(0).toUpperCase()}</div>`;
        } else {
            bubble.className = 'flex gap-3 items-start';
            bubble.innerHTML = `<div class="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-robot"></i></div><div class="bg-slate-100 p-3 rounded-lg rounded-tl-none ai-response"><p class="text-slate-700">${text}</p></div>`;
        }
        historyContainer.appendChild(bubble);
        historyContainer.scrollTop = historyContainer.scrollHeight;
        return bubble;
    };

    const handleSend = async () => {
        const question = input.value.trim();
        if (!question) return;
        addMessageToHistory(question, 'user');
        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;
        const typingBubble = addMessageToHistory('<div class="typing-indicator"><span></span><span></span><span></span></div>', 'ai');
        try {
            const result = await getAiAssistantResponse({ lessonText: lessonData.content, userQuestion: question });
            typingBubble.querySelector('.ai-response p').innerHTML = result.data.answer.replace(/\n/g, '<br>');
        } catch (e) {
            typingBubble.querySelector('.ai-response p').innerHTML = `<span class="text-red-500">Omlouvám se, došlo k chybě: ${e.message}</span>`;
        } finally {
            input.disabled = false;
            sendBtn.disabled = false;
            input.focus();
        }
    };
    sendBtn.replaceWith(sendBtn.cloneNode(true));
    contentContainer.querySelector('#ai-assistant-send-btn').addEventListener('click', handleSend);
    input.replaceWith(input.cloneNode(true));
    contentContainer.querySelector('#ai-assistant-input').addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } });
}

function initializeProfessorChat(lessonData) {
    const contentContainer = document.getElementById('student-lesson-content-container');
    const chatInput = contentContainer.querySelector('#student-chat-input');
    const sendBtn = contentContainer.querySelector('#student-send-message-btn');
    const chatHistoryArea = contentContainer.querySelector('#chat-history-area');

    const handleSendMessage = async () => {
        const text = chatInput.value.trim();
        if (!text) return;
        const userBubble = document.createElement('div');
        userBubble.className = 'chat-bubble chat-bubble-user';
        userBubble.textContent = text;
        chatHistoryArea.appendChild(userBubble);
        chatHistoryArea.scrollTop = chatHistoryArea.scrollHeight;
        const originalButtonContent = sendBtn.innerHTML;
        sendBtn.innerHTML = `<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>`;
        chatInput.value = '';
        chatInput.disabled = true;
        sendBtn.disabled = true;
        try {
            await sendMessageToProfessor({ lessonId: lessonData.id, text });
        } catch (error) {
            console.error("Error sending message to professor:", error);
            userBubble.style.outline = '2px solid red';
            alert(`Chyba při odesílání: ${error.message}`);
        } finally {
            chatInput.disabled = false;
            sendBtn.disabled = false;
            sendBtn.innerHTML = originalButtonContent;
            chatInput.focus();
        }
    };
    sendBtn.replaceWith(sendBtn.cloneNode(true));
    contentContainer.querySelector('#student-send-message-btn').addEventListener('click', handleSendMessage);
    chatInput.replaceWith(chatInput.cloneNode(true));
    contentContainer.querySelector('#student-chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleSendMessage(); } });
}