import { collection, getDocs, doc, query, where, updateDoc, orderBy, onSnapshot, addDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
import { db, auth, functions } from './firebase-init.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { handleLogout } from './auth.js';
import { getAiAssistantResponse } from './gemini-api.js';


// Globálne premenné a listenery
let studentDataUnsubscribe = null;
let lessonsData = [];
let currentUserData = null;
let currentLessonData = null;
let currentLessonId = null;

// Firebase Functions callables
const sendMessageFromStudent = httpsCallable(functions, 'sendMessageFromStudent');
const submitQuizResults = httpsCallable(functions, 'submitQuizResults');
const submitTestResults = httpsCallable(functions, 'submitTestResults');


export function initStudentDashboard() {
    const user = auth.currentUser;
    if (!user) {
        console.error("Kritická chyba: initStudentDashboard bol spustený bez prihláseného používateľa!");
        document.getElementById('app-container').innerHTML = `<p class="p-8 text-center text-red-600">Nastala kritická chyba pri prihlasovaní. Skúste obnoviť stránku.</p>`;
        return;
    }

    if (studentDataUnsubscribe) studentDataUnsubscribe();

    const userDocRef = doc(db, "students", user.uid);
    
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
                // Pre nových používateľov vytvoríme token pre Telegram
                const token = `TGM-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
                await setDoc(doc(db, "students", user.uid), {
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
            await updateDoc(doc(db, 'students', userId), { name: name });
            showToast('Jméno úspěšně uloženo!');
        } catch (error) {
            showToast('Nepodařilo se uložit jméno.', true);
        }
    });
}

async function renderStudentPanel() {
    const appContainer = document.getElementById('app-container');
    // Mobil-first header
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
    // Mobile-first grid
    mainContent.innerHTML = `<h2 class="text-2xl font-bold mb-6 text-slate-800">Moje lekce</h2>
                             <div id="lessons-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">Načítání lekcí...</div>`;

    try {
        const q = query(collection(db, "lessons"), orderBy("createdAt", "desc"));
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
            // Responsive card styling
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
    // Zjednotenie názvov polí pre robustnosť
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

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
            
            <div class="bg-white p-0 rounded-2xl shadow-xl flex flex-col h-[70vh] lg:h-auto">
                <div class="w-full h-full flex flex-col">
                    <div class="bg-[#56A0D3] text-white p-3 rounded-t-2xl flex items-center shadow-md flex-shrink-0">
                        <div class="w-10 h-10 bg-white rounded-full flex items-center justify-center font-bold text-xl text-[#56A0D3]">A</div>
                        <div class="ml-3">
                            <h3 class="font-semibold text-lg">AI Asistent</h3>
                            <p class="text-sm text-gray-200">Konzultace k lekci</p>
                        </div>
                    </div>

                    <div class="sticky top-0 z-10 p-2 bg-yellow-100 text-center text-sm text-yellow-800 border-b border-t">
                        <p class="font-semibold mb-1">Telegram Chat</p>
                        <a href="https://t.me/ai_sensei_czu_bot" target="_blank" class="font-bold hover:underline">Otevřete bota</a> a pošlete mu kód:
                        <strong class="block bg-white text-slate-700 p-1 mt-1 rounded text-xs select-all">${currentUserData.telegramLinkToken || 'CHYBA: Kód nenalezen'}</strong>
                    </div>

                    <div id="ai-chat-history" class="flex-grow overflow-y-auto p-3 bg-[#EAEAEA]"></div>
                    
                    <div class="bg-white p-3 border-t flex-shrink-0">
                        <div class="flex items-center">
                            <input type="text" id="ai-chat-input" placeholder="Zpráva" class="flex-grow bg-gray-100 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#56A0D3]">
                            <button id="send-ai-btn" class="ml-2 w-10 h-10 bg-[#56A0D3] text-white rounded-full flex items-center justify-center hover:bg-[#4396C8] transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="bg-white p-4 md:p-6 rounded-2xl shadow-lg flex flex-col h-[70vh] lg:h-auto">
                <h3 class="text-2xl font-bold mb-4">Konzultace s profesorem</h3>
                <div id="prof-chat-history" class="h-96 max-h-[60vh] overflow-y-auto border p-3 rounded-lg bg-slate-50 mb-4 flex-grow"></div>
                <div class="flex gap-2">
                    <input type="text" id="prof-chat-input" placeholder="Zadejte dotaz pro profesora..." class="flex-grow p-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                    <button id="send-prof-btn" class="bg-slate-700 text-white font-bold py-3 px-5 rounded-lg hover:bg-slate-800 transition-colors">Odeslat</button>
                </div>
            </div>

        </div>
    `;

    document.getElementById('back-to-lessons-btn').addEventListener('click', fetchAndDisplayLessons);
    renderLessonTabs();
    
    // Attach new event listeners for separate chats
    document.getElementById('send-ai-btn').addEventListener('click', () => sendMessage('ai'));
    document.getElementById('ai-chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('send-ai-btn').click();
    });

    document.getElementById('send-prof-btn').addEventListener('click', () => sendMessage('professor'));
    document.getElementById('prof-chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('send-prof-btn').click();
    });
    
    // Load histories for both chats
    loadChatHistory('ai');
    loadChatHistory('professor');
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
    
    availableTabs.forEach((tab) => {
        const tabEl = document.createElement('button');
        tabEl.id = `${tab.id}-tab`;
        // Responsive classes for tabs
        tabEl.className = 'px-3 py-2 md:px-6 md:py-3 font-semibold border-b-2 transition-colors text-sm md:text-base'; 
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
    // Všetok obsah vo switchi používa mobil-first (p-4 md:p-8)
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
    }
}

// Funkcia pre vykreslenie kvízu, teraz vrátane mobil-first a ID pre feedback
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

        // 1. Zobrazenie výsledkov/feedbacku
        displayQuizResults(quiz, userAnswers); 
        
        // 2. Odoslanie výsledkov do Firebase
        let finalScore = 0;
        quiz.questions.forEach((q) => {
            const userAnswer = userAnswers.find(ua => ua.question === q.question_text)?.answer;
            const correctOption = q.options[q.correct_option_index];
            if (userAnswer === correctOption) {
                finalScore++;
            }
        });

        try {
            await submitQuizResults({ 
                lessonId: currentLessonId, 
                quizTitle: quiz.title, 
                score: finalScore / quiz.questions.length, // Skóre ako ratio/percento
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

// Funkcia pre vizuálne vyhodnotenie kvízu po odovzdaní
function displayQuizResults(quiz, userAnswers) {
    const contentArea = document.getElementById('lesson-tab-content');
    let score = 0;
    
    // Disable submission button
    document.getElementById('submit-quiz')?.remove();

    // Calculate final score and inject detailed feedback
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

        // Vizuálna zmena celého kontajnera otázky
        questionContainer.classList.remove('border-gray-200');
        questionContainer.classList.add(isCorrect ? 'border-green-500' : 'border-red-500');
        
        // Detailný feedback pod otázkou
        const userFeedbackText = isCorrect 
            ? `<span class="text-green-600">✅ Správne!</span>`
            : `<span class="text-red-600">❌ Chyba. Správna odpoveď: <strong>${correctOption}</strong></span>`;
        
        feedbackEl.innerHTML = userFeedbackText;

        // Iterácia cez možnosti a zafarbenie štítkov
        q.options.forEach((option, optionIndex) => {
            const labelEl = document.getElementById(`option-label-${index}-${optionIndex}`);
            const inputEl = labelEl ? labelEl.querySelector('input') : null;
            if (!labelEl || !inputEl) return;
            
            inputEl.disabled = true; // Zablokovanie po odovzdaní

            if (optionIndex === correctOptionIndex) {
                // Zelené pozadie pre správnu odpoveď
                labelEl.classList.remove('border-gray-300', 'hover:bg-slate-50');
                labelEl.classList.add('bg-green-100', 'border-green-500', 'font-semibold');
            } else if (option === userAnswer && !isCorrect) {
                // Červené pozadie pre nesprávne zvolenú odpoveď
                labelEl.classList.remove('border-gray-300', 'hover:bg-slate-50');
                labelEl.classList.add('bg-red-100', 'border-red-500', 'line-through');
            }
        });
    });

    // Vložíme finálne skóre nad kvíz
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

async function loadChatHistory(type) { // type can be 'ai' or 'professor'
    const chatHistoryEl = document.getElementById(type === 'ai' ? 'ai-chat-history' : 'prof-chat-history');
    chatHistoryEl.innerHTML = 'Načítání konverzace...';
    try {
        const q = query(
            collection(db, `conversations/${currentUserData.id}/messages`),
            where("lessonId", "==", currentLessonId),
            where("type", "==", type), // Filter messages by type
            orderBy("timestamp", "asc")
        );
        onSnapshot(q, (snapshot) => {
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

    // Immediately append the student's message to the correct UI
    appendChatMessage({ text: text, sender: 'student' }, type);
    inputEl.value = '';

    try {
        if (type === 'ai') {
            appendChatMessage({ text: '...', sender: 'ai-typing' }, type);

            const response = await getAiAssistantResponse({
                lessonId: currentLessonId,
                userQuestion: text
            });

            document.querySelector('#ai-chat-history .ai-typing-indicator')?.remove();
            
            if (response.error) {
                 appendChatMessage({ text: `Chyba: ${response.error}`, sender: 'ai' }, type);
            } else {
                 appendChatMessage({ text: response.answer, sender: 'ai' }, type);
            }

        } else { // type === 'professor'
            await sendMessageFromStudent({
                lessonId: currentLessonId,
                text: text
            });
        }
    } catch (error) {
        console.error("Error sending message:", error);
        showToast("Nepodařilo se odeslat zprávu.", true);
        if (type === 'ai') {
            document.querySelector('#ai-chat-history .ai-typing-indicator')?.remove();
            appendChatMessage({ text: 'Omlouvám se, došlo k chybě.', sender: 'ai' }, type);
        }
    }
}

function appendChatMessage(data, type) {
    const chatHistoryEl = document.getElementById(type === 'ai' ? 'ai-chat-history' : 'prof-chat-history');
    const isAI = type === 'ai';

    const msgDiv = document.createElement('div');
    // Common classes for all messages
    let baseClasses = 'p-2 px-3 my-1 rounded-lg text-sm';
    let senderPrefix = '';
    // Max width for chat bubbles
    let maxWidthClass = 'max-w-[80%]'; 

    if (data.sender === 'student') {
        // Student messages (right-aligned)
        // AI Chat style: Telegram user green (#DCF8C6)
        // Professor Chat style: Standard blue
        msgDiv.className = `${baseClasses} ${maxWidthClass} ${isAI ? 'bg-[#DCF8C6]' : 'bg-blue-500 text-white'} ml-auto rounded-tr-none float-right clear-both`;
    } else if (data.sender === 'ai-typing') {
        // Typing indicator
        msgDiv.className = `${baseClasses} ${maxWidthClass} bg-gray-200 text-gray-500 italic mr-auto rounded-tl-none float-left ai-typing-indicator clear-both`;
        data.text = 'píše...'; 
    } else { 
        // AI or Professor messages (left-aligned)
        // AI Chat style: White background
        // Professor Chat style: Standard grey
        msgDiv.className = `${baseClasses} ${maxWidthClass} ${isAI ? 'bg-white' : 'bg-gray-200'} text-slate-800 mr-auto rounded-tl-none float-left clear-both`;
        if (data.sender === 'ai') senderPrefix = '<strong>AI Asistent:</strong><br>';
        if (data.sender === 'professor') senderPrefix = '<strong>Profesor:</strong><br>';
    }
    
    msgDiv.innerHTML = senderPrefix + data.text.replace(/\n/g, '<br>');
    chatHistoryEl.appendChild(msgDiv);
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}
