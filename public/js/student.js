import { collection, getDocs, doc, query, where, updateDoc, orderBy, onSnapshot, addDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
// --- ZMENA: Importujeme celý firebaseInit, aby sme mali prístup k aktualizovaným objektom ---
import * as firebaseInit from './firebase-init.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { handleLogout } from './auth.js';
import { getAiAssistantResponse } from './gemini-api.js';

let studentDataUnsubscribe = null;
let lessonsData = [];
let currentUserData = null;
let currentLessonData = null;
let currentLessonId = null;

// --- ZMENA: Premenné pre callable funkcie, inicializované na null ---
let _sendMessageFromStudentCallable = null;
let _submitQuizResultsCallable = null;
let _submitTestResultsCallable = null;

// --- ZMENA: Funkcia na získanie (alebo vytvorenie) callable funkcie ---
function getSendMessageFromStudentCallable() {
    if (!_sendMessageFromStudentCallable) {
        console.log("Lazy initializing sendMessageFromStudent callable. Current functions object:", firebaseInit.functions);
        if (!firebaseInit.functions) {
            console.error("CRITICAL: Firebase Functions object is still not available when trying to create sendMessageFromStudent callable!");
            throw new Error("Firebase Functions not initialized.");
        }
        _sendMessageFromStudentCallable = httpsCallable(firebaseInit.functions, 'sendMessageFromStudent');
    }
    return _sendMessageFromStudentCallable;
}

// --- ZMENA: Funkcia na získanie (alebo vytvorenie) callable funkcie ---
function getSubmitQuizResultsCallable() {
    if (!_submitQuizResultsCallable) {
        console.log("Lazy initializing submitQuizResults callable. Current functions object:", firebaseInit.functions);
        if (!firebaseInit.functions) {
            console.error("CRITICAL: Firebase Functions object is still not available when trying to create submitQuizResults callable!");
            throw new Error("Firebase Functions not initialized.");
        }
        _submitQuizResultsCallable = httpsCallable(firebaseInit.functions, 'submitQuizResults');
    }
    return _submitQuizResultsCallable;
}

// --- ZMENA: Funkcia na získanie (alebo vytvorenie) callable funkcie ---
function getSubmitTestResultsCallable() {
    if (!_submitTestResultsCallable) {
        console.log("Lazy initializing submitTestResults callable. Current functions object:", firebaseInit.functions);
        if (!firebaseInit.functions) {
            console.error("CRITICAL: Firebase Functions object is still not available when trying to create submitTestResults callable!");
            throw new Error("Firebase Functions not initialized.");
        }
        _submitTestResultsCallable = httpsCallable(firebaseInit.functions, 'submitTestResults');
    }
    return _submitTestResultsCallable;
}


export function initStudentDashboard() {
    // --- ZMENA: Používame firebaseInit.auth ---
    const user = firebaseInit.auth.currentUser;
    if (!user) {
        console.error("Kritická chyba: initStudentDashboard bol spustený bez prihláseného používateľa!");
        document.getElementById('app-container').innerHTML = `<p class="p-8 text-center text-red-600">Nastala kritická chyba pri prihlasovaní. Skúste obnoviť stránku.</p>`;
        return;
    }

    if (studentDataUnsubscribe) studentDataUnsubscribe();

    // --- ZMENA: Používame firebaseInit.db ---
    const userDocRef = doc(firebaseInit.db, "students", user.uid);
    
    studentDataUnsubscribe = onSnapshot(userDocRef, async (docSnapshot) => {
        if (docSnapshot.exists()) {
            currentUserData = { id: docSnapshot.id, ...docSnapshot.data() };
            if (!currentUserData.name || currentUserData.name.trim() === '') {
                promptForStudentName(user.uid);
            } else {
                await renderStudentPanel();
            }
        } else {
            console.warn(`Profil pre študenta s UID ${user.uid} nebol nájdený. Vytváram nový...`);
            try {
                const token = `TGM-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
                // --- ZMENA: Používame firebaseInit.db ---
                await setDoc(doc(firebaseInit.db, "students", user.uid), {
                    email: user.email,
                    createdAt: serverTimestamp(),
                    name: '',
                    telegramLinkToken: token
                });
                console.log(`Profil pre študenta ${user.uid} bol úspešne vytvorený.`);
            } catch (error) {
                console.error("Nepodarilo sa automaticky vytvoriť profil študenta:", error);
                const appContainer = document.getElementById('app-container');
                if (appContainer) {
                    appContainer.innerHTML = `<p class="text-red-500 text-center p-8">Chyba: Nepodarilo sa vytvoriť váš profil. Kontaktujte administrátora.</p>`;
                }
            }
        }
    }, (error) => {
        console.error("Chyba pri načítavaní profilu študenta:", error);
        document.getElementById('app-container').innerHTML = `<p class="text-red-500 text-center p-8">Chyba oprávnení. Uistite sa, že máte prístup k dátam.</p>`;
    });
}

// --- PRIDANÁ FUNKCIA ---
export function cleanupStudentDashboard() {
    if (studentDataUnsubscribe) {
        studentDataUnsubscribe();
        studentDataUnsubscribe = null;
        console.log("Student dashboard listener cleaned up.");
    }
}
// --- KONIEC PRIDANEJ FUNKCIE ---

function promptForStudentName(userId) {
    const appContainer = document.getElementById('app-container');
    appContainer.innerHTML = `
        <div class="flex items-center justify-center min-h-screen bg-slate-100">
            <div class="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md text-center">
                <h1 class="text-2xl font-bold text-slate-800 mb-4">Vítejte v AI Sensei!</h1>
                <p class="text-slate-600 mb-6">Prosím, zadejte své jméno, abychom věděli, jak vás oslovovat.</p>
                <input type="text" id="student-name-input" placeholder="Vaše jméno a příjmení" class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                <button id="save-name-btn" class="w-full mt-4 bg-green-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-800 transition-colors">Uložit a pokračovat</button>
            </div>
        </div>`;

    document.getElementById('save-name-btn').addEventListener('click', async () => {
        const name = document.getElementById('student-name-input').value.trim();
        if (!name) return showToast('Jméno nemůže být prázdné.', true);

        try {
            // --- ZMENA: Používame firebaseInit.db ---
            await updateDoc(doc(firebaseInit.db, 'students', userId), { name: name });
            showToast('Jméno úspěšně uloženo!');
        } catch (error) {
            showToast('Nepodařilo se uložit jméno.', true);
        }
    });
}

async function renderStudentPanel() {
    const appContainer = document.getElementById('app-container');
    appContainer.innerHTML = `
        <div class="flex flex-col h-screen">
            <header class="bg-white shadow-md p-3 md:p-4 flex justify-between items-center flex-shrink-0">
                <h1 class="text-lg md:text-xl font-bold text-green-800">AI Sensei - Student</h1>
                <div>
                    <span class="text-slate-700 text-sm mr-2 md:mr-4 hidden sm:inline">Vítejte, <strong>${currentUserData.name}</strong>!</span>
                    <button id="student-logout-btn" class="bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-1.5 px-3 md:py-2 md:px-4 rounded-lg">Odhlásit se</button>
                </div>
            </header>
            <main id="student-main-content" class="flex-grow overflow-y-auto p-4 md:p-8 bg-slate-50"></main>
        </div>
    `;
    document.getElementById('student-logout-btn').addEventListener('click', handleLogout);
    await fetchAndDisplayLessons();
}

async function fetchAndDisplayLessons() {
    const mainContent = document.getElementById('student-main-content');
    mainContent.innerHTML = `<h2 class="text-2xl font-bold mb-6 text-slate-800">Moje lekce</h2>
                             <div id="lessons-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">Načítání lekcí...</div>`;

    try {
        // --- ZMENA: Používame firebaseInit.db ---
        const q = query(collection(firebaseInit.db, "lessons"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const lessonsGrid = document.getElementById('lessons-grid');
        if (lessonsData.length === 0) {
            lessonsGrid.innerHTML = `<p class="text-slate-500">Zatím nebyly přiřazeny žádné lekce.</p>`;
            return;
        }

        lessonsGrid.innerHTML = '';
        lessonsData.forEach(lesson => {
            const lessonCard = document.createElement('div');
            lessonCard.className = 'bg-white p-5 rounded-xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all';
            lessonCard.innerHTML = `
                <h3 class="text-lg font-bold text-slate-900">${lesson.title}</h3>
                <p class="text-xs text-slate-500 mt-2">Vytvořeno: ${lesson.createdAt ? new Date(lesson.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</p>
            `;
            lessonCard.addEventListener('click', () => showLessonDetail(lesson.id));
            lessonsGrid.appendChild(lessonCard);
        });
    } catch (error) {
        console.error("Error fetching lessons:", error);
        mainContent.innerHTML = `<p class="text-red-500">Nepodařilo se načíst lekce.</p>`;
    }
}

function normalizeLessonData(rawData) {
    const normalized = { ...rawData };
    normalized.youtube_link = rawData.youtube_link || rawData.videoUrl || null;
    normalized.presentation = rawData.presentation || rawData.presentationData || null;
    normalized.podcast_script = rawData.podcast_script || rawData.post || rawData.postData || null;
    normalized.text_content = rawData.text_content || rawData.content || null;
    normalized.quiz = rawData.quiz || rawData.quizData || null;
    normalized.test = rawData.test || rawData.testData || null;
    return normalized;
}

function showLessonDetail(lessonId) {
    currentLessonId = lessonId;
    const rawLessonData = lessonsData.find(l => l.id === lessonId);
    if (!rawLessonData) return;

    currentLessonData = normalizeLessonData(rawLessonData);
    
    const mainContent = document.getElementById('student-main-content');
    mainContent.innerHTML = `
        <div class="mb-6">
            <button id="back-to-lessons-btn" class="text-green-700 hover:underline flex items-center">&larr; Zpět na přehled lekcí</button>
        </div>
        <div class="bg-white p-4 md:p-8 rounded-2xl shadow-lg mb-6">
            <h2 class="text-2xl md:text-3xl font-bold mb-4">${currentLessonData.title}</h2>
            <div id="lesson-tabs" class="border-b mb-4 md:mb-6 flex overflow-x-auto whitespace-nowrap scrollable-tabs"></div>
            <div id="lesson-tab-content"></div>
        </div>
    `;

    document.getElementById('back-to-lessons-btn').addEventListener('click', fetchAndDisplayLessons);
    renderLessonTabs();
    
    loadChatHistory('professor');
    loadChatHistory('ai');
}

function renderLessonTabs() {
    const tabsContainer = document.getElementById('lesson-tabs');
    tabsContainer.innerHTML = '';
    const availableTabs = [];

    if (currentLessonData.text_content) availableTabs.push({ id: 'text', name: 'Text' });
    if (currentLessonData.youtube_link) availableTabs.push({ id: 'video', name: 'Video' });
    if (currentLessonData.presentation) availableTabs.push({ id: 'presentation', name: 'Prezentace' });
    if (currentLessonData.quiz) availableTabs.push({ id: 'quiz', name: 'Kvíz' });
    if (currentLessonData.test) availableTabs.push({ id: 'test', name: 'Test' });
    if (currentLessonData.podcast_script) availableTabs.push({ id: 'podcast', name: 'Podcast' });
    
    availableTabs.push({ id: 'ai-assistant', name: 'AI Asistent' });
    availableTabs.push({ id: 'professor-chat', name: 'Konzultace' });
    
    availableTabs.forEach((tab) => {
        const tabEl = document.createElement('button');
        tabEl.id = `${tab.id}-tab`;
        tabEl.className = 'px-3 py-2 md:px-6 md:py-3 font-semibold border-b-2 transition-colors text-sm md:text-base flex-shrink-0'; 
        tabEl.textContent = tab.name;
        tabEl.addEventListener('click', () => switchTab(tab.id));
        tabsContainer.appendChild(tabEl);
    });

    if (availableTabs.length > 0) {
        switchTab(availableTabs[0].id);
    } else {
        document.getElementById('lesson-tab-content').innerHTML = `<p class="text-slate-500">Pro tuto lekci zatím není dostupný žádný obsah.</p>`;
    }
}

function switchTab(tabId) {
    document.querySelectorAll('#lesson-tabs button').forEach(btn => {
        btn.classList.remove('border-green-700', 'text-green-700');
        btn.classList.add('border-transparent', 'text-slate-500', 'hover:text-green-700');
    });
    document.getElementById(`${tabId}-tab`).classList.add('border-green-700', 'text-green-700');

    const contentArea = document.getElementById('lesson-tab-content');
    
    switch (tabId) {
        case 'text':
            contentArea.innerHTML = `<div class="prose max-w-none">${currentLessonData.text_content.replace(/\n/g, '<br>')}</div>`;
            break;
        case 'video':
            const videoIdMatch = currentLessonData.youtube_link.match(/(?:v=|\/embed\/|\.be\/)([\w-]{11})/);
            if (videoIdMatch) {
                 contentArea.innerHTML = `<iframe class="w-full aspect-video rounded-lg" src="https://www.youtube.com/embed/${videoIdMatch[1]}" frameborder="0" allowfullscreen></iframe>`;
            } else {
                 contentArea.innerHTML = `<p class="text-red-500">Neplatný YouTube odkaz.</p>`;
            }
            break;
        case 'presentation':
             if(currentLessonData.presentation && currentLessonData.presentation.slides) {
                contentArea.innerHTML = currentLessonData.presentation.slides.map((slide, i) => `
                    <div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm">
                        <h4 class="font-bold text-green-700">Slide ${i+1}: ${slide.title}</h4>
                        <ul class="list-disc list-inside mt-2 text-sm text-slate-600">
                            ${(slide.points || []).map(p => `<li>${p}</li>`).join('')}
                        </ul>
                    </div>`).join('');
             } else {
                contentArea.innerHTML = `<p>Obsah prezentace není ve správném formátu.</p>`;
             }
             break;
        case 'quiz':
            renderQuiz();
            break;
        case 'test':
            renderTest();
            break;
        case 'podcast':
            if(currentLessonData.podcast_script && currentLessonData.podcast_script.episodes) {
                contentArea.innerHTML = currentLessonData.podcast_script.episodes.map((episode, i) => `
                    <div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm">
                        <h4 class="font-bold text-green-700">Epizoda ${i+1}: ${episode.title}</h4>
                        <p class="mt-2 text-sm text-slate-600">${(episode.script || '').replace(/\n/g, '<br>')}</p>
                    </div>`).join('');
            } else {
                contentArea.innerHTML = `<p>Obsah podcastu není ve správném formátu.</p>`;
            }
            break;
        case 'ai-assistant':
            contentArea.innerHTML = renderAIChatView();
            document.getElementById('ai-chat-menu').querySelectorAll('button').forEach(button => {
                button.addEventListener('click', () => switchAIChatSubView(button.dataset.chatType));
            });
            switchAIChatSubView('web'); 
            break;
        case 'professor-chat':
            contentArea.innerHTML = renderProfessorChatView();
            document.getElementById('send-prof-btn').addEventListener('click', () => sendMessage('professor'));
            document.getElementById('prof-chat-input').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') document.getElementById('send-prof-btn').click();
            });
            loadChatHistory('professor');
            break;
    }
}

function renderAIChatView() {
    return `
        <div class="bg-white p-0 rounded-2xl shadow-xl flex flex-col h-[60vh] lg:h-[70vh]">
            <div class="w-full h-full flex flex-col">
                <div class="bg-[#56A0D3] text-white p-3 rounded-t-2xl flex items-center shadow-md flex-shrink-0">
                    <div class="w-10 h-10 bg-white rounded-full flex items-center justify-center font-bold text-xl text-[#56A0D3]">A</div>
                    <div class="ml-3">
                        <h3 class="font-semibold text-lg">AI Asistent</h3>
                        <p class="text-sm text-gray-200">Vyberte způsob komunikace</p>
                    </div>
                </div>

                <div id="ai-chat-menu" class="flex border-b border-gray-200 bg-slate-50 flex-shrink-0">
                    <button id="ai-tab-web" data-chat-type="web" class="px-4 py-2 text-sm font-semibold border-b-2 transition-colors">Web Chat</button>
                    <button id="ai-tab-telegram" data-chat-type="telegram" class="px-4 py-2 text-sm font-semibold border-b-2 border-transparent text-slate-500 hover:text-[#56A0D3] transition-colors">Telegram App</button>
                </div>

                <div id="ai-chat-content" class="flex-grow flex flex-col bg-[#EAEAEA]"></div>
            </div>
        </div>
    `;
}

function switchAIChatSubView(viewType) {
    const contentContainer = document.getElementById('ai-chat-content');
    const menuButtons = document.getElementById('ai-chat-menu').querySelectorAll('button');

    menuButtons.forEach(btn => {
        btn.classList.remove('border-[#56A0D3]', 'text-[#56A0D3]');
        btn.classList.add('border-transparent', 'text-slate-500');
    });
    
    const selectedButton = document.getElementById(`ai-tab-${viewType}`);
    selectedButton.classList.add('border-[#56A0D3]', 'text-[#56A0D3]');
    selectedButton.classList.remove('border-transparent', 'text-slate-500');
    
    if (viewType === 'web') {
        contentContainer.innerHTML = renderAIChatWebInterface();
        document.getElementById('send-ai-btn').addEventListener('click', () => sendMessage('ai'));
        document.getElementById('ai-chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('send-ai-btn').click();
        });
        loadChatHistory('ai');
    } else if (viewType === 'telegram') {
        contentContainer.innerHTML = renderAITelegramLink();
    }
}

function renderAIChatWebInterface() {
    return `
        <div id="ai-chat-history" class="flex-grow overflow-y-auto p-3 bg-[#EAEAEA]"></div>
        <div class="bg-white p-3 border-t flex-shrink-0">
            <div class="flex items-center">
                <input type="text" id="ai-chat-input" placeholder="Zpráva" class="flex-grow bg-gray-100 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#56A0D3]">
                <button id="send-ai-btn" class="ml-2 w-10 h-10 bg-[#56A0D3] text-white rounded-full flex items-center justify-center hover:bg-[#4396C8] transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </div>
        </div>
    `;
}

function renderAITelegramLink() {
    return `
        <div class="flex flex-col items-center justify-center p-8 text-center flex-grow">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 text-[#56A0D3] mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 17l-4 4-4-4"></path><path d="M13 19V5"></path><path d="M9 13l4-4 4 4"></path></svg>
            <h3 class="text-xl font-bold mb-2">Komunikujte cez Telegram</h3>
            <p class="text-slate-600 mb-4">Pre jednoduchšiu a rýchlejšiu komunikáciu v mobile použite nášho bota v aplikácii Telegram.</p>
            <a href="https://t.me/ai_sensei_czu_bot" target="_blank" class="bg-[#56A0D3] text-white font-bold py-3 px-6 rounded-full hover:bg-[#4396C8] transition-colors mb-4">
                Otvoriť Telegram Bota
            </a>
            <p class="text-sm text-slate-500 mt-2">Po otvorení pošlite botovi pre spárovanie tento kód:</p>
            <strong class="block bg-gray-200 text-slate-800 p-2 rounded-lg text-lg select-all font-mono">${currentUserData.telegramLinkToken || 'CHYBA: Kód nenalezen'}</strong>
        </div>
    `;
}

function renderProfessorChatView() {
    return `
        <div class="bg-white p-4 md:p-6 rounded-2xl shadow-lg flex flex-col h-[60vh] lg:h-[70vh]">
            <h3 class="text-2xl font-bold mb-4">Konzultace s profesorem</h3>
            <div id="prof-chat-history" class="h-96 max-h-[60vh] overflow-y-auto border p-3 rounded-lg bg-slate-50 mb-4 flex-grow"></div>
            <div class="flex gap-2">
                <input type="text" id="prof-chat-input" placeholder="Zadejte dotaz pro profesora..." class="flex-grow p-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                <button id="send-prof-btn" class="bg-slate-700 text-white font-bold py-3 px-5 rounded-lg hover:bg-slate-800 transition-colors">Odeslat</button>
            </div>
        </div>
    `;
}


function renderQuiz() {
    const quiz = currentLessonData.quiz;
    if (!quiz || !quiz.questions) {
        document.getElementById('lesson-tab-content').innerHTML = `<p>Obsah kvízu není ve správném formátu.</p>`;
        return;
    }

    const contentArea = document.getElementById('lesson-tab-content');
    let html = `<h3 class="text-xl md:text-2xl font-bold mb-4">${quiz.title || 'Kvíz'}</h3>`;

    quiz.questions.forEach((q, index) => {
        html += `<div class="mb-6 p-4 border border-gray-200 rounded-lg bg-white shadow-sm" id="question-container-${index}">
                    <p class="font-semibold mb-3 text-lg">${index + 1}. ${q.question_text}</p>`;
        (q.options || []).forEach((option, optionIndex) => {
            html += `<label class="block p-3 border border-gray-300 rounded-md mb-2 cursor-pointer hover:bg-slate-50 transition-colors" id="option-label-${index}-${optionIndex}">
                        <input type="radio" name="q${index}" value="${option}" class="mr-3 transform scale-110 text-green-600">
                        ${option}
                     </label>`;
        });
        html += `<div id="feedback-${index}" class="mt-2 font-bold text-sm"></div>`; // Placeholder for feedback
        html += `</div>`;
    });
    html += `<button id="submit-quiz" class="w-full bg-green-700 text-white font-bold py-3 px-4 rounded-lg text-lg hover:bg-green-800 transition-colors">Odevzdat kvíz</button>`;
    contentArea.innerHTML = html;

    document.getElementById('submit-quiz').addEventListener('click', async () => {
        const userAnswers = [];
        let allAnswered = true;

        quiz.questions.forEach((q, index) => {
            const selected = document.querySelector(`input[name="q${index}"]:checked`);
            const userAnswerText = selected ? selected.value : "Nezodpovězeno";
            userAnswers.push({ question: q.question_text, answer: userAnswerText });
            if (!selected) {
                allAnswered = false;
            }
        });
        
        if (!allAnswered) {
             showToast("Prosím, odpovězte na všechny otázky!", true);
             return;
        }

        displayQuizResults(quiz, userAnswers); 
        
        let finalScore = 0;
        quiz.questions.forEach((q) => {
            const userAnswer = userAnswers.find(ua => ua.question === q.question_text)?.answer;
            const correctOption = q.options[q.correct_option_index];
            if (userAnswer === correctOption) {
                finalScore++;
            }
        });

        try {
            // --- ZMENA: Používame "lazy" funkciu ---
            const submitCallable = getSubmitQuizResultsCallable();
            await submitCallable({ 
                lessonId: currentLessonId, 
                quizTitle: quiz.title, 
                score: finalScore / quiz.questions.length,
                totalQuestions: quiz.questions.length,
                answers: userAnswers
            });
            showToast("Kvíz úspešne odovzdaný a vyhodnotený!");
        } catch (error) {
            showToast("Nepodarilo sa odovzdať kvíz do databázy.", true);
            console.error("Error submitting quiz:", error);
        }
    });
}

function displayQuizResults(quiz, userAnswers) {
    const contentArea = document.getElementById('lesson-tab-content');
    let score = 0;
    
    document.getElementById('submit-quiz')?.remove();

    quiz.questions.forEach((q, index) => {
        const correctOptionIndex = q.correct_option_index;
        const correctOption = q.options[correctOptionIndex];
        const userAnswer = userAnswers.find(ua => ua.question === q.question_text)?.answer;
        
        const isCorrect = userAnswer === correctOption;
        if (isCorrect) {
            score++;
        }
        
        const questionContainer = document.getElementById(`question-container-${index}`);
        const feedbackEl = document.getElementById(`feedback-${index}`);
        if (!questionContainer || !feedbackEl) return;

        questionContainer.classList.remove('border-gray-200');
        questionContainer.classList.add(isCorrect ? 'border-green-500' : 'border-red-500');
        
        const userFeedbackText = isCorrect 
            ? `<span class="text-green-600">✅ Správne!</span>`
            : `<span class="text-red-600">❌ Chyba. Správna odpoveď: <strong>${correctOption}</strong></span>`;
        
        feedbackEl.innerHTML = userFeedbackText;

        q.options.forEach((option, optionIndex) => {
            const labelEl = document.getElementById(`option-label-${index}-${optionIndex}`);
            const inputEl = labelEl ? labelEl.querySelector('input') : null;
            if (!labelEl || !inputEl) return;
            
            inputEl.disabled = true;

            if (optionIndex === correctOptionIndex) {
                labelEl.classList.remove('border-gray-300', 'hover:bg-slate-50');
                labelEl.classList.add('bg-green-100', 'border-green-500', 'font-semibold');
            } else if (option === userAnswer && !isCorrect) {
                labelEl.classList.remove('border-gray-300', 'hover:bg-slate-50');
                labelEl.classList.add('bg-red-100', 'border-red-500', 'line-through');
            }
        });
    });

    const scoreHtml = `
        <div class="text-center p-6 mb-6 rounded-xl bg-green-700 text-white shadow-lg">
            <h3 class="text-xl md:text-2xl font-bold">Váš konečný výsledek</h3>
            <p class="text-3xl md:text-4xl font-extrabold mt-2">${score} / ${quiz.questions.length}</p>
        </div>
    `;
    contentArea.insertAdjacentHTML('afterbegin', scoreHtml);
}

function renderTest() {
    const contentArea = document.getElementById('lesson-tab-content');
    contentArea.innerHTML = `<p>Test pre túto lekciu bude dostupný čoskoro.</p>`;
}

async function loadChatHistory(type) { 
    const chatHistoryEl = document.getElementById(type === 'ai' ? 'ai-chat-history' : 'prof-chat-history');
    if (!chatHistoryEl) return; 

    chatHistoryEl.innerHTML = 'Načítání konverzace...';
    try {
        // --- ZMENA: Používame firebaseInit.db ---
        const q = query(
            collection(firebaseInit.db, `conversations/${currentUserData.id}/messages`),
            where("lessonId", "==", currentLessonId),
            where("type", "==", type), 
            orderBy("timestamp", "asc")
        );
        onSnapshot(q, (snapshot) => {
            if (!document.getElementById(type === 'ai' ? 'ai-chat-history' : 'prof-chat-history')) return;

            chatHistoryEl.innerHTML = '';
            if (snapshot.empty) {
                chatHistoryEl.innerHTML = `<p class="text-center text-slate-400 p-4">Začněte konverzaci...</p>`;
                return;
            }
            snapshot.docs.forEach(doc => {
                appendChatMessage(doc.data(), type);
            });
        }, (error) => {
            console.error(`Error with ${type} chat listener:`, error);
            chatHistoryEl.innerHTML = '<p class="text-red-500">Chyba pri načítavaní konverzácie.</p>';
        });
    } catch (error) {
        console.error(`Error loading ${type} chat history:`, error);
        chatHistoryEl.innerHTML = '<p class="text-red-500">Nepodařilo se načíst konverzaci.</p>';
    }
}

async function sendMessage(type) {
    const inputEl = document.getElementById(type === 'ai' ? 'ai-chat-input' : 'prof-chat-input');
    const text = inputEl.value.trim();
    if (!text) return;

    // --- ZMENA: Ukladáme správu študenta do DB VŽDY ---
    const messageData = { 
        lessonId: currentLessonId, 
        text: text,
        sender: 'student',
        type: type, // 'ai' alebo 'professor'
        timestamp: serverTimestamp() 
    };
    try {
         // --- ZMENA: Používame firebaseInit.db ---
         await addDoc(collection(firebaseInit.db, `conversations/${currentUserData.id}/messages`), messageData);
         console.log(`Student message saved to DB for type: ${type}`);
    } catch (dbError) {
         console.error(`Error saving student message to DB for type ${type}:`, dbError);
    }

    // Zobrazenie v UI (zostáva rovnaké)
    appendChatMessage({ text: text, sender: 'student' }, type);
    inputEl.value = '';

    try {
        if (type === 'ai') {
            appendChatMessage({ text: '...', sender: 'ai-typing' }, type);

            // --- ZMENA: Používame priamo importovanú funkciu, nie dynamický import ---
            const response = await getAiAssistantResponse({
                lessonId: currentLessonId,
                userQuestion: text
            });

            document.querySelector('#ai-chat-history .ai-typing-indicator')?.remove();
            
            let aiResponseText = '';
            if (response.error) {
                 aiResponseText = `Chyba: ${response.error}`;
                 appendChatMessage({ text: aiResponseText, sender: 'ai' }, type);
            } else {
                 aiResponseText = response.answer;
                 appendChatMessage({ text: aiResponseText, sender: 'ai' }, type);
            }
            
            // --- ZMENA: Uloženie odpovede AI do DB ---
             try {
                 await addDoc(collection(firebaseInit.db, `conversations/${currentUserData.id}/messages`), {
                     lessonId: currentLessonId,
                     text: aiResponseText,
                     sender: 'ai',
                     type: 'ai',
                     timestamp: serverTimestamp()
                 });
                 console.log("AI response saved to DB.");
             } catch(dbError) {
                  console.error("Error saving AI response to DB:", dbError);
             }

        } else { 
            // --- ZMENA: Používame "lazy" funkciu ---
            const sendMessageCallable = getSendMessageFromStudentCallable();
            await sendMessageCallable({
                // lessonId a text sa posielajú v backende, 
                // ale funkcia 'sendMessageFromStudent' v backende berie len {text: string}
                // Ak backend očakáva aj lessonId, odkomentujte to:
                // lessonId: currentLessonId,
                text: text
            });
            // Správa bola odoslaná, backend ju uloží do konverzácie profesora
        }
    } catch (error) {
        console.error("Error sending message:", error);
        showToast("Nepodařilo se odeslat zprávu.", true);
        if (type === 'ai') {
            document.querySelector('#ai-chat-history .ai-typing-indicator')?.remove();
            const errorText = `Omlouvám se, došlo k chybě: ${error.message}`;
            appendChatMessage({ text: errorText, sender: 'ai' }, type);
            
            // --- ZMENA: Uloženie chybovej odpovede AI do DB ---
             try {
                 await addDoc(collection(firebaseInit.db, `conversations/${currentUserData.id}/messages`), {
                     lessonId: currentLessonId,
                     text: errorText,
                     sender: 'ai',
                     type: 'ai',
                     timestamp: serverTimestamp()
                 });
                 console.log("AI error response saved to DB.");
             } catch(dbError) {
                  console.error("Error saving AI error response to DB:", dbError);
             }
        }
    }
}

function appendChatMessage(data, type) {
    const chatHistoryEl = document.getElementById(type === 'ai' ? 'ai-chat-history' : 'prof-chat-history');
    if (!chatHistoryEl) return; 
    
    const isAI = type === 'ai';

    const msgDiv = document.createElement('div');
    let baseClasses = 'p-2 px-3 my-1 rounded-lg text-sm';
    let senderPrefix = '';
    let maxWidthClass = 'max-w-[80%]'; 

    if (data.sender === 'student') {
        msgDiv.className = `${baseClasses} ${maxWidthClass} ${isAI ? 'bg-[#DCF8C6]' : 'bg-blue-500 text-white'} ml-auto rounded-tr-none float-right clear-both`;
    } else if (data.sender === 'ai-typing') {
        msgDiv.className = `${baseClasses} ${maxWidthClass} bg-gray-200 text-gray-500 italic mr-auto rounded-tl-none float-left ai-typing-indicator clear-both`;
        data.text = 'píše...'; 
    } else { 
        msgDiv.className = `${baseClasses} ${maxWidthClass} ${isAI ? 'bg-white' : 'bg-gray-200'} text-slate-800 mr-auto rounded-tl-none float-left clear-both`;
        if (data.sender === 'ai') senderPrefix = '<strong>AI Asistent:</strong><br>';
        if (data.sender === 'professor') senderPrefix = '<strong>Profesor:</strong><br>';
    }
    
    msgDiv.innerHTML = senderPrefix + data.text.replace(/\n/g, '<br>');
    chatHistoryEl.appendChild(msgDiv);
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}
