import { collection, getDocs, doc, query, where, updateDoc, orderBy, onSnapshot, addDoc, serverTimestamp, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"; // Pridaný Timestamp
import { showToast } from './utils.js';
import * as firebaseInit from './firebase-init.js';
// import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js"; // Už nie je potrebné tu
import { handleLogout } from './auth.js';
// import { getAiAssistantResponse } from './gemini-api.js'; // Presunuté do chat-panel

// ===== NOVÝ IMPORT pre prezentáciu =====
import { renderPresentation } from './student/presentation-handler.js';
// =====================================

// ==== PRIDANÉ ZMENY (Načítanie všetkých komponentov) ====
import './student/quiz-component.js';
import './student/test-component.js';
import './student/podcast-component.js';
import './student/chat-panel.js'; // Nový chat komponent
// ====================================================

let studentDataUnsubscribe = null;
let lessonsData = [];
let currentUserData = null;
let currentLessonData = null;
let currentLessonId = null;

// ==== ODSTRÁNENÉ ZMENY (Všetky callable presunuté do komponentov) ====
// let _sendMessageFromStudentCallable = null;
// =================================================================

// ==== ODSTRÁNENÉ ZMENY (Všetky Firebase funkcie presunuté) ====
// function getSendMessageFromStudentCallable() { ... }
// ============================================================


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
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        console.log("Speech synthesis cancelled on cleanup.");
    }
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
    
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
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
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }

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
    if (!contentArea) return;
    
    // Vyčistíme obsah pred pridaním komponentu
    contentArea.innerHTML = ''; 
    
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
        
        case 'quiz':
            if (!currentLessonData.quiz || !currentLessonData.quiz.questions) {
                 contentArea.innerHTML = `<p>Obsah kvízu není k dispozici nebo není ve správném formátu.</p>`;
                 break;
            }
            const quizEl = document.createElement('student-quiz');
            quizEl.quizData = currentLessonData.quiz;
            quizEl.lessonId = currentLessonId;
            contentArea.appendChild(quizEl);
            break;

        case 'test':
            if (!currentLessonData.test || !currentLessonData.test.questions) {
                 contentArea.innerHTML = `<p>Obsah testu není k dispozici nebo není ve správném formátu.</p>`;
                 break;
            }
            const testEl = document.createElement('student-test');
            testEl.testData = currentLessonData.test;
            testEl.lessonId = currentLessonId;
            contentArea.appendChild(testEl);
            break;

        case 'podcast':
            const podcastEl = document.createElement('student-podcast');
            podcastEl.podcastData = currentLessonData.podcast_script;
            contentArea.appendChild(podcastEl);
            break;

        // ==== ZMENENÝ BLOK (Použitie Lit komponentu) ====
        case 'ai-assistant':
            const aiChatEl = document.createElement('chat-panel');
            aiChatEl.type = 'ai';
            aiChatEl.lessonId = currentLessonId;
            aiChatEl.currentUserData = currentUserData; // Komponent potrebuje dáta o userovi
            contentArea.appendChild(aiChatEl);
            break;
        // ===============================================

        // ==== ZMENENÝ BLOK (Použitie Lit komponentu) ====
        case 'professor-chat':
            const profChatEl = document.createElement('chat-panel');
            profChatEl.type = 'professor';
            profChatEl.lessonId = currentLessonId;
            profChatEl.currentUserData = currentUserData; // Komponent potrebuje dáta o userovi
            contentArea.appendChild(profChatEl);
            break;
        // ===============================================
    }
}

// ==== ODSTRÁNENÉ ZMENY (Všetky funkcie pre chat presunuté do komponentu) ====
// function renderAIChatView() { ... }
// function switchAIChatSubView(viewType) { ... }
// function renderAIChatWebInterface() { ... }
// function renderAITelegramLink() { ... }
// function renderProfessorChatView() { ... }
// async function loadChatHistory(type) { ... }
// async function sendMessage(type) { ... }
// function appendChatMessage(data, type, elementId = null) { ... }
// ===========================================================================
