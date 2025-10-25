import { collection, getDocs, doc, query, where, updateDoc, orderBy, onSnapshot, addDoc, serverTimestamp, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"; // Pridaný Timestamp
import { showToast } from './utils.js';
import * as firebaseInit from './firebase-init.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { handleLogout } from './auth.js';
import { getAiAssistantResponse } from './gemini-api.js';
// ===== NOVÝ IMPORT pre prezentáciu =====
import { renderPresentation } from './student/presentation-handler.js';
// =====================================

// ==== PRIDANÉ ZMENY (Načítanie nových komponentov) ====
import './student/quiz-component.js';
import './student/test-component.js';
import './student/podcast-component.js';
// ====================================================

let studentDataUnsubscribe = null;
let lessonsData = [];
let currentUserData = null;
let currentLessonData = null;
let currentLessonId = null;

let _sendMessageFromStudentCallable = null;
// ==== ODSTRÁNENÉ ZMENY (Logika presunutá do komponentov) ====
// let _submitQuizResultsCallable = null;
// let _submitTestResultsCallable = null;
// let currentSpeechUtterance = null;
// let currentPlayingEpisodeIndex = -1;
// ==========================================================

function getSendMessageFromStudentCallable() {
    if (!_sendMessageFromStudentCallable) {
        // console.log("Lazy initializing sendMessageFromStudent callable. Current functions object:", firebaseInit.functions); // Odstránené logovanie
        if (!firebaseInit.functions) {
            console.error("CRITICAL: Firebase Functions object is still not available when trying to create sendMessageFromStudent callable!");
            throw new Error("Firebase Functions not initialized.");
        }
        _sendMessageFromStudentCallable = httpsCallable(firebaseInit.functions, 'sendMessageFromStudent');
    }
    return _sendMessageFromStudentCallable;
}

// ==== ODSTRÁNENÉ ZMENY (Funkcie getSubmit... presunuté do komponentov) ====
// function getSubmitQuizResultsCallable() { ... }
// function getSubmitTestResultsCallable() { ... }
// =======================================================================


export function initStudentDashboard() {
    const user = firebaseInit.auth.currentUser;
    if (!user) {
        console.error("Kritická chyba: initStudentDashboard bol spustený bez prihláseného používateľa!");
        document.getElementById('app-container').innerHTML = `<p class="p-8 text-center text-red-600">Nastala kritická chyba pri prihlasovaní. Skúste obnoviť stránku.</p>`;
        return;
    }

    if (studentDataUnsubscribe) studentDataUnsubscribe();

    const userDocRef = doc(firebaseInit.db, "students", user.uid);
    
    studentDataUnsubscribe = onSnapshot(userDocRef, async (docSnapshot) => {
        if (docSnapshot.exists()) {
            currentUserData = { id: docSnapshot.id, ...docSnapshot.data() };
            if (!currentUserData.name || currentUserData.name.trim() === '') {
                promptForStudentName(user.uid);
            } else {
                // Skontrolujeme, či už panel existuje, aby sme ho zbytočne neprekresľovali pri každej zmene mena
                if (!document.getElementById('student-main-content')) {
                    await renderStudentPanel();
                }
            }
        } else {
            console.warn(`Profil pre študenta s UID ${user.uid} nebol nájdený. Vytváram nový...`);
            try {
                const token = `TGM-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
                await setDoc(doc(firebaseInit.db, "students", user.uid), {
                    email: user.email,
                    createdAt: serverTimestamp(),
                    name: '',
                    telegramLinkToken: token
                });
                console.log(`Profil pre študenta ${user.uid} bol úspešne vytvorený.`);
                // Po vytvorení profilu hneď zobrazíme výzvu na zadanie mena
                promptForStudentName(user.uid);
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

export function cleanupStudentDashboard() {
    if (studentDataUnsubscribe) {
        studentDataUnsubscribe();
        studentDataUnsubscribe = null;
        console.log("Student dashboard listener cleaned up.");
    }
    // Zastaviť prehrávanie, ak nejaké beží
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        console.log("Speech synthesis cancelled on cleanup.");
    }
    // ==== ODSTRÁNENÉ ZMENY (Globálne premenné sú preč) ====
    // currentSpeechUtterance = null;
    // currentPlayingEpisodeIndex = -1;
    // ====================================================
}

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
            await updateDoc(doc(firebaseInit.db, 'students', userId), { name: name });
            showToast('Jméno úspěšně uloženo!');
            // Nemusíme manuálne volať renderStudentPanel, onSnapshot by to mal spraviť
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
        const q = query(
            collection(firebaseInit.db, "lessons"), 
            where("isScheduled", "==", true), 
            orderBy("createdAt", "desc")
        );
        
        const querySnapshot = await getDocs(q);
        lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const lessonsGrid = document.getElementById('lessons-grid');
        if (lessonsData.length === 0) {
            lessonsGrid.innerHTML = `<p class="text-slate-500">Zatím vám nebyly přiřazeny žádné lekce.</p>`;
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
        
        if (error.code === 'failed-precondition') {
             mainContent.innerHTML = `<p class="text-red-500">Chyba databáze: Chybí potřebný index.</p>
             <p class="text-slate-600 mt-2">Tato chyba se zobrazí, protože je potřeba vytvořit databázový index pro filtrování lekcí. 
             Otevřete prosím konzoli vývojáře (F12), najděte chybu a klikněte na odkaz, který vám Firebase nabízí pro automatické vytvoření indexu.</p>`;
             console.warn("POŽADOVANÁ AKCE: Pro opravu této chyby je nutné vytvořit kompozitní index ve Firestore. Otevřete odkaz z chybové hlášky ve vaší konzoli.");
        } else {
             mainContent.innerHTML = `<p class="text-red-500">Nepodařilo se načíst lekce. (${error.message})</p>`;
        }
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
    
    // Zastaviť predchádzajúce prehrávanie pri zobrazení novej lekcie
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
    // ==== ODSTRÁNENÉ ZMENY (Globálne premenné sú preč) ====
    // currentSpeechUtterance = null;
    // currentPlayingEpisodeIndex = -1;
    // ====================================================
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
    // Zastaviť prehrávanie podcastu pri prepnutí tabu
    // Toto je dôležité a zostáva to tu. Spustí to `onend` listener v komponente.
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
    // ==== ODSTRÁNENÉ ZMENY (Globálne premenné sú preč) ====
    // currentSpeechUtterance = null;
    // currentPlayingEpisodeIndex = -1;
    // ====================================================

    document.querySelectorAll('#lesson-tabs button').forEach(btn => {
        btn.classList.remove('border-green-700', 'text-green-700');
        btn.classList.add('border-transparent', 'text-slate-500', 'hover:text-green-700');
    });
    const activeTabButton = document.getElementById(`${tabId}-tab`);
    if (activeTabButton) {
        activeTabButton.classList.add('border-green-700', 'text-green-700');
        activeTabButton.classList.remove('border-transparent', 'text-slate-500');
    }

    const contentArea = document.getElementById('lesson-tab-content');
    if (!contentArea) return; // Kontrola
    
    switch (tabId) {
        case 'text':
            contentArea.innerHTML = `<div class="prose max-w-none">${currentLessonData.text_content.replace(/\n/g, '<br>')}</div>`;
            break;
        case 'video':
            const videoIdMatch = currentLessonData.youtube_link ? currentLessonData.youtube_link.match(/(?:v=|\/embed\/|\.be\/)([\w-]{11})/) : null;
            if (videoIdMatch && videoIdMatch[1]) {
                 contentArea.innerHTML = `<iframe class="w-full aspect-video rounded-lg" src="https://www.youtube.com/embed/${videoIdMatch[1]}" frameborder="0" allowfullscreen></iframe>`;
            } else {
                 contentArea.innerHTML = `<p class="text-red-500">Neplatný nebo chybějící YouTube odkaz.</p>`;
            }
            break;
        case 'presentation':
             renderPresentation(contentArea, currentLessonData.presentation);
             break;
        
        // ==== ZMENENÝ BLOK (Použitie Lit komponentu) ====
        case 'quiz':
            if (!currentLessonData.quiz || !currentLessonData.quiz.questions) {
                 contentArea.innerHTML = `<p>Obsah kvízu není k dispozici nebo není ve správném formátu.</p>`;
                 break;
            }
            contentArea.innerHTML = ''; 
            const quizEl = document.createElement('student-quiz');
            quizEl.quizData = currentLessonData.quiz;
            quizEl.lessonId = currentLessonId;
            contentArea.appendChild(quizEl);
            break;
        // ===============================================

        // ==== ZMENENÝ BLOK (Použitie Lit komponentu) ====
        case 'test':
            if (!currentLessonData.test || !currentLessonData.test.questions) {
                 contentArea.innerHTML = `<p>Obsah testu není k dispozici nebo není ve správném formátu.</p>`;
                 break;
            }
            contentArea.innerHTML = ''; 
            const testEl = document.createElement('student-test');
            testEl.testData = currentLessonData.test;
            testEl.lessonId = currentLessonId;
            contentArea.appendChild(testEl);
            break;
        // ===============================================

        // ==== ZMENENÝ BLOK (Použitie Lit komponentu) ====
        case 'podcast':
            contentArea.innerHTML = '';
            const podcastEl = document.createElement('student-podcast');
            podcastEl.podcastData = currentLessonData.podcast_script;
            contentArea.appendChild(podcastEl);
            break;
        // ===============================================

        case 'ai-assistant':
            contentArea.innerHTML = renderAIChatView();
            document.getElementById('ai-chat-menu').querySelectorAll('button').forEach(button => {
                button.addEventListener('click', () => switchAIChatSubView(button.dataset.chatType));
            });
            switchAIChatSubView('web'); 
            break;
        case 'professor-chat':
            contentArea.innerHTML = renderProfessorChatView();
            const profInput = document.getElementById('prof-chat-input');
            const profSendBtn = document.getElementById('send-prof-btn');
            if (profSendBtn) {
                 profSendBtn.addEventListener('click', () => sendMessage('professor'));
            }
            if(profInput && profSendBtn) { 
                profInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') profSendBtn.click();
                });
            }
            loadChatHistory('professor');
            break;
    }
}

// ==== ODSTRÁNENÉ ZMENY (Všetky funkcie pre podcast presunuté do komponentu) ====
// function setupPodcastListeners() { ... }
// function handlePlayPodcast(event) { ... }
// function handlePausePodcast() { ... }
// function handleStopPodcast() { ... }
// function updatePodcastButtons(index, isPlaying) { ... }
// function resetPodcastButtons() { ... }
// ===========================================================================


function renderAIChatView() {
    // ... (kód zostáva nezmenený)
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
    // ... (kód zostáva nezmenený)
    const contentContainer = document.getElementById('ai-chat-content');
    const menuButtons = document.getElementById('ai-chat-menu')?.querySelectorAll('button'); // Pridaná kontrola

    menuButtons?.forEach(btn => { // Pridaná kontrola
        btn.classList.remove('border-[#56A0D3]', 'text-[#56A0D3]');
        btn.classList.add('border-transparent', 'text-slate-500');
    });
    
    const selectedButton = document.getElementById(`ai-tab-${viewType}`);
    selectedButton?.classList.add('border-[#56A0D3]', 'text-[#56A0D3]'); // Pridaná kontrola
    selectedButton?.classList.remove('border-transparent', 'text-slate-500'); // Pridaná kontrola
    
    if (contentContainer) { // Pridaná kontrola
        if (viewType === 'web') {
            contentContainer.innerHTML = renderAIChatWebInterface();
            const aiSendBtn = document.getElementById('send-ai-btn');
            const aiInput = document.getElementById('ai-chat-input');
            if (aiSendBtn) {
                 aiSendBtn.addEventListener('click', () => sendMessage('ai'));
            }
            if (aiInput && aiSendBtn) { // Kontrola pre obidva
                aiInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') aiSendBtn.click();
                });
            }
            loadChatHistory('ai');
        } else if (viewType === 'telegram') {
            contentContainer.innerHTML = renderAITelegramLink();
        }
    }
}

function renderAIChatWebInterface() {
    // ... (kód zostáva nezmenený)
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
    // ... (kód zostáva nezmenený)
    const token = currentUserData?.telegramLinkToken || 'CHYBA: Kód nenalezen'; // Bezpečnejší prístup
    return `
        <div class="flex flex-col items-center justify-center p-8 text-center flex-grow">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 text-[#56A0D3] mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 17l-4 4-4-4"></path><path d="M13 19V5"></path><path d="M9 13l4-4 4 4"></path></svg>
            <h3 class="text-xl font-bold mb-2">Komunikujte cez Telegram</h3>
            <p class="text-slate-600 mb-4">Pre jednoduchšiu a rýchlejšiu komunikáciu v mobile použite nášho bota v aplikácii Telegram.</p>
            <a href="https://t.me/ai_sensei_czu_bot" target="_blank" class="bg-[#56A0D3] text-white font-bold py-3 px-6 rounded-full hover:bg-[#4396C8] transition-colors mb-4">
                Otvoriť Telegram Bota
            </a>
            <p class="text-sm text-slate-500 mt-2">Po otvorení pošlite botovi pre spárovanie tento kód:</p>
            <strong class="block bg-gray-200 text-slate-800 p-2 rounded-lg text-lg select-all font-mono">${token}</strong>
        </div>
    `;
}

function renderProfessorChatView() {
    // ... (kód zostáva nezmenený)
     return `
        <div class="bg-white p-4 md:p-6 rounded-2xl shadow-lg flex flex-col h-[60vh] lg:h-[70vh]">
            <h3 class="text-2xl font-bold mb-4">Konzultace s profesorem</h3>
            <div id="prof-chat-history" class="overflow-y-auto border p-3 rounded-lg bg-slate-50 mb-4 flex-grow"></div>
            <div class="flex gap-2 flex-shrink-0">
                <input type="text" id="prof-chat-input" placeholder="Zadejte dotaz pro profesora..." class="flex-grow p-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                <button id="send-prof-btn" class="bg-slate-700 text-white font-bold py-3 px-5 rounded-lg hover:bg-slate-800 transition-colors">Odeslat</button>
            </div>
        </div>
    `;
}


// ==== ODSTRÁNENÉ ZMENY (Funkcie renderQuiz a displayQuizResults) ====
// ...
// =================================================================


// ==== ODSTRÁNENÉ ZMENY (Funkcie renderTest a displayTestResults) ====
// ...
// =================================================================


async function loadChatHistory(type) { 
    // ... (kód zostáva nezmenený)
    const chatHistoryElId = type === 'ai' ? 'ai-chat-history' : 'prof-chat-history';
    const chatHistoryEl = document.getElementById(chatHistoryElId);
    if (!chatHistoryEl) {
        console.warn(`Chat history element not found: ${chatHistoryElId}`);
        return; 
    }

    chatHistoryEl.innerHTML = '<p class="text-center text-slate-400 p-4">Načítání konverzace...</p>';
    try {
        const q = query(
            collection(firebaseInit.db, `conversations/${currentUserData.id}/messages`),
            where("lessonId", "==", currentLessonId),
            where("type", "==", type), 
            orderBy("timestamp", "asc")
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const currentChatHistoryEl = document.getElementById(chatHistoryElId);
            if (!currentChatHistoryEl) return; 

            currentChatHistoryEl.innerHTML = ''; 
            if (snapshot.empty) {
                currentChatHistoryEl.innerHTML = `<p class="text-center text-slate-400 p-4">Začněte konverzaci...</p>`;
            } else {
                snapshot.docs.forEach(doc => {
                    appendChatMessage(doc.data(), type, chatHistoryElId);
                });
                 currentChatHistoryEl.scrollTop = currentChatHistoryEl.scrollHeight;
            }
        }, (error) => {
            console.error(`Error with ${type} chat listener:`, error);
            const currentChatHistoryEl = document.getElementById(chatHistoryElId);
            if (currentChatHistoryEl) {
                currentChatHistoryEl.innerHTML = '<p class="text-red-500 p-4 text-center">Chyba při načítání konverzace.</p>';
            }
        });
        // TODO: Manažovať tieto unsubscribe funkcie lepšie

    } catch (error) {
        console.error(`Error loading ${type} chat history:`, error);
        chatHistoryEl.innerHTML = '<p class="text-red-500 p-4 text-center">Nepodařilo se načíst konverzaci.</p>';
    }
}

async function sendMessage(type) {
    // ... (kód zostáva nezmenený)
    const inputEl = document.getElementById(type === 'ai' ? 'ai-chat-input' : 'prof-chat-input');
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = ''; 

    const messageData = { 
        lessonId: currentLessonId, 
        text: text,
        sender: 'student',
        type: type, // 'ai' alebo 'professor'
        timestamp: serverTimestamp() 
    };

    try {
         const messageRef = collection(firebaseInit.db, `conversations/${currentUserData.id}/messages`);
         await addDoc(messageRef, messageData);
         console.log(`Student message saved to DB for type: ${type}`);

         if (type === 'ai') {
            const chatHistoryEl = document.getElementById('ai-chat-history');
            const typingIndicator = appendChatMessage({ text: '...', sender: 'ai-typing' }, 'ai', 'ai-chat-history'); 

            try {
                const response = await getAiAssistantResponse({
                    lessonId: currentLessonId,
                    userQuestion: text
                });
                
                typingIndicator?.remove(); 

                let aiResponseText = '';
                if (response.error) {
                     aiResponseText = `Chyba AI: ${response.error}`;
                } else {
                     aiResponseText = response.answer || "Omlouvám se, nedostal jsem odpověď.";
                }

                 await addDoc(messageRef, {
                     lessonId: currentLessonId,
                     text: aiResponseText,
                     sender: 'ai',
                     type: 'ai',
                     timestamp: serverTimestamp()
                 });
                 console.log("AI response saved to DB.");

            } catch (aiError) {
                console.error("Error getting AI response:", aiError);
                typingIndicator?.remove();
                const errorText = `Omlouvám se, došlo k chybě při komunikaci s AI: ${aiError.message || aiError}`;
                 try {
                     await addDoc(messageRef, {
                         lessonId: currentLessonId,
                         text: errorText,
                         sender: 'ai', 
                         type: 'ai',
                         timestamp: serverTimestamp()
                     });
                 } catch(dbError) {
                      console.error("Error saving AI error response to DB:", dbError);
                 }
            }

        } else { // Ak je pre profesora
            try {
                const notifyProfessorCallable = getSendMessageFromStudentCallable(); 
                await notifyProfessorCallable({ text: text }); 
            } catch (callError) {
                 console.error("Error notifying professor:", callError);
                 showToast("Nepodařilo se upozornit profesora na zprávu.", true);
            }
        }
    } catch (error) {
        console.error("Error sending message or saving to DB:", error);
        showToast("Nepodařilo se odeslat zprávu.", true);
        appendChatMessage({ text: `CHYBA: Zprávu "${text}" se nepodařilo odeslat.`, sender: 'system-error' }, type);
    }
}


function appendChatMessage(data, type, elementId = null) {
    // ... (kód zostáva nezmenený)
    const chatHistoryElId = elementId || (type === 'ai' ? 'ai-chat-history' : 'prof-chat-history');
    const chatHistoryEl = document.getElementById(chatHistoryElId);
    if (!chatHistoryEl) return null; 
    
    const placeholder = chatHistoryEl.querySelector('p.text-slate-400');
    placeholder?.remove();

    const isAI = type === 'ai';

    const msgDiv = document.createElement('div');
    let baseClasses = 'p-2 px-3 my-1 rounded-lg text-sm clear-both max-w-[80%]'; 
    let senderPrefix = '';
    let alignmentClasses = '';

    if (data.sender === 'student') {
        alignmentClasses = 'ml-auto float-right';
        msgDiv.className = `${baseClasses} ${isAI ? 'bg-[#DCF8C6]' : 'bg-blue-500 text-white'} ${alignmentClasses} rounded-tr-none`;
    } else if (data.sender === 'ai-typing') {
        alignmentClasses = 'mr-auto float-left';
        msgDiv.className = `${baseClasses} bg-gray-200 text-gray-500 italic ${alignmentClasses} rounded-tl-none ai-typing-indicator`;
        data.text = 'píše...'; 
    } else if (data.sender === 'system-error') {
         alignmentClasses = 'mx-auto'; 
         msgDiv.className = `${baseClasses} bg-red-100 text-red-700 text-center ${alignmentClasses}`;
         senderPrefix = '<strong>Systém:</strong><br>';
    } else { // ai, professor
        alignmentClasses = 'mr-auto float-left';
        msgDiv.className = `${baseClasses} ${isAI ? 'bg-white' : 'bg-gray-200'} text-slate-800 ${alignmentClasses} rounded-tl-none`;
        if (data.sender === 'ai') senderPrefix = '<strong>AI Asistent:</strong><br>';
        if (data.sender === 'professor') senderPrefix = '<strong>Profesor:</strong><br>';
    }
    
    let timestampText = '';
    if (data.timestamp) {
         try {
             const date = (data.timestamp && typeof data.timestamp.toDate === 'function') 
                          ? data.timestamp.toDate() 
                          : new Date(data.timestamp); 
             timestampText = `<span class="block text-xs ${data.sender === 'student' ? (isAI ? 'text-gray-500' : 'text-blue-200') : 'text-gray-400'} mt-1 text-right">${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
         } catch (e) { 
             console.warn("Error formatting timestamp:", data.timestamp, e);
         }
    }
    
    msgDiv.innerHTML = senderPrefix + (data.text || '').replace(/\n/g, '<br>') + timestampText;
    chatHistoryEl.appendChild(msgDiv);
    
    const isScrolledToBottom = chatHistoryEl.scrollHeight - chatHistoryEl.clientHeight <= chatHistoryEl.scrollTop + 50; 
    if (isScrolledToBottom || data.sender === 'student' || data.sender === 'ai-typing') { 
        chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
    }

    return msgDiv; 
}
