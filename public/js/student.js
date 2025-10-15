import { collection, getDocs, doc, query, where, updateDoc, orderBy, onSnapshot, addDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
import { db, auth, functions } from './firebase-init.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { handleLogout } from './auth.js';

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

/**
 * Hlavná inicializačná funkcia pre študentský panel.
 * Spustí sa po úspešnom prihlásení.
 */
export function initStudentDashboard() {
    const user = auth.currentUser;
    if (!user) {
        console.error("Kritická chyba: initStudentDashboard bol spustený bez prihláseného používateľa!");
        document.getElementById('app-container').innerHTML = `<p class="p-8 text-center text-red-600">Nastala kritická chyba pri prihlasovaní. Skúste obnoviť stránku.</p>`;
        return;
    }

    // Odpojíme starý listener, ak by náhodou existoval, aby sme predišli duplicite
    if (studentDataUnsubscribe) studentDataUnsubscribe();

    const userDocRef = doc(db, "students", user.uid);
    
    // Vytvoríme listener, ktorý bude sledovať zmeny v profile študenta
    studentDataUnsubscribe = onSnapshot(userDocRef, async (docSnapshot) => {
        if (docSnapshot.exists()) {
            currentUserData = { id: docSnapshot.id, ...docSnapshot.data() };
            // Ak študent nemá zadané meno (napr. po prvej registrácii), vyzveme ho na zadanie
            if (!currentUserData.name || currentUserData.name.trim() === '') {
                promptForStudentName(user.uid);
            } else {
                // Ak má meno, zobrazíme hlavný panel aplikácie
                await renderStudentPanel();
            }
        } else {
            // --- ZAČIATOK ÚPRAVY ---
            // Ak dokument študenta neexistuje, automaticky ho vytvoríme.
            console.warn(`Profil pre študenta s UID ${user.uid} nebol nájdený. Vytváram nový...`);
            try {
                await setDoc(doc(db, "students", user.uid), {
                    email: user.email,
                    createdAt: serverTimestamp(),
                    name: '' // Meno si študent doplní v nasledujúcom kroku
                });
                console.log(`Profil pre študenta ${user.uid} bol úspešne vytvorený.`);
                // Po vytvorení sa tento listener (onSnapshot) automaticky spustí znova a už dokument nájde.
            } catch (error) {
                console.error("Nepodarilo sa automaticky vytvoriť profil študenta:", error);
                const appContainer = document.getElementById('app-container');
                if (appContainer) {
                    appContainer.innerHTML = `<p class="text-red-500 text-center p-8">Chyba: Nepodarilo sa vytvoriť váš profil. Kontaktujte administrátora.</p>`;
                }
            }
            // --- KONIEC ÚPRAVY ---
        }
    }, (error) => {
        console.error("Chyba pri načítavaní profilu študenta:", error);
        document.getElementById('app-container').innerHTML = `<p class="text-red-500 text-center p-8">Chyba oprávnení. Uistite sa, že máte prístup k dátam.</p>`;
    });
}

/**
 * Zobrazí formulár na zadanie mena študenta.
 */
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
            // Listener onSnapshot sa automaticky postará o prekreslenie na hlavný panel
        } catch (error) {
            showToast('Nepodařilo se uložit jméno.', true);
        }
    });
}

/**
 * Vykreslí hlavnú štruktúru študentského panela.
 */
async function renderStudentPanel() {
    const appContainer = document.getElementById('app-container');
    appContainer.innerHTML = `
        <div class="flex flex-col h-screen">
            <header class="bg-white shadow-md p-4 flex justify-between items-center">
                <h1 class="text-xl font-bold text-green-800">AI Sensei - Panel studenta</h1>
                <div>
                    <span class="text-slate-700 mr-4">Vítejte, <strong>${currentUserData.name}</strong>!</span>
                    <button id="student-logout-btn" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">Odhlásit se</button>
                </div>
            </header>
            <main id="student-main-content" class="flex-grow overflow-y-auto p-8 bg-slate-50">
                </main>
        </div>
    `;
    document.getElementById('student-logout-btn').addEventListener('click', handleLogout);
    
    // Načítame a zobrazíme lekcie
    await fetchAndDisplayLessons();
}

/**
 * Načíta lekcie z databázy a zobrazí ich.
 */
async function fetchAndDisplayLessons() {
    const mainContent = document.getElementById('student-main-content');
    mainContent.innerHTML = `<h2 class="text-2xl font-bold mb-6 text-slate-800">Moje lekce</h2>
                             <div id="lessons-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">Načítání lekcí...</div>`;

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
            lessonCard.className = 'bg-white p-6 rounded-xl shadow-lg cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all';
            lessonCard.innerHTML = `
                <h3 class="text-xl font-bold text-slate-900">${lesson.title}</h3>
                <p class="text-sm text-slate-500 mt-2">Vytvořeno: ${lesson.createdAt ? new Date(lesson.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</p>
            `;
            lessonCard.addEventListener('click', () => showLessonDetail(lesson.id));
            lessonsGrid.appendChild(lessonCard);
        });
    } catch (error) {
        console.error("Error fetching lessons:", error);
        mainContent.innerHTML = `<p class="text-red-500">Nepodařilo se načíst lekce.</p>`;
    }
}

/**
 * Zobrazí detail vybranej lekcie.
 */
function showLessonDetail(lessonId) {
    currentLessonId = lessonId;
    currentLessonData = lessonsData.find(l => l.id === lessonId);
    if (!currentLessonData) return;

    const mainContent = document.getElementById('student-main-content');
    mainContent.innerHTML = `
        <div class="mb-6">
            <button id="back-to-lessons-btn" class="text-green-700 hover:underline">&larr; Zpět na přehled lekcí</button>
        </div>
        <div class="bg-white p-8 rounded-2xl shadow-lg">
            <h2 class="text-3xl font-bold mb-4">${currentLessonData.title}</h2>
            <div id="lesson-tabs" class="border-b mb-6">
                </div>
            <div id="lesson-tab-content">
                </div>
        </div>
        <div id="student-chat-container" class="mt-8 bg-white p-8 rounded-2xl shadow-lg">
            <h3 class="text-2xl font-bold mb-4">Máte dotaz?</h3>
            <div id="chat-history" class="h-80 overflow-y-auto border p-4 rounded-lg bg-slate-50 mb-4"></div>
            <div class="flex gap-4">
                <input type="text" id="chat-input" placeholder="Zeptejte se AI asistenta..." class="flex-grow p-3 border rounded-lg">
                <button id="send-ai-btn" class="bg-green-700 text-white font-bold py-3 px-6 rounded-lg">Zeptat se AI</button>
                <button id="send-prof-btn" class="bg-slate-700 text-white font-bold py-3 px-6 rounded-lg">Konzultovat s profesorem</button>
            </div>
        </div>
    `;

    document.getElementById('back-to-lessons-btn').addEventListener('click', fetchAndDisplayLessons);
    renderLessonTabs();
    
    document.getElementById('send-ai-btn').addEventListener('click', () => sendMessage('ai'));
    document.getElementById('send-prof-btn').addEventListener('click', () => sendMessage('professor'));
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('send-ai-btn').click();
    });
    
    loadChatHistory();
}

/**
 * Vykreslí záložky pre obsah lekcie.
 */
function renderLessonTabs() {
    const tabsContainer = document.getElementById('lesson-tabs');
    tabsContainer.innerHTML = '';
    const availableTabs = [];

    if (currentLessonData.text_content) availableTabs.push({ id: 'text', name: 'Text' });
    if (currentLessonData.youtube_link) availableTabs.push({ id: 'video', name: 'Video' });
    if (currentLessonData.quiz) availableTabs.push({ id: 'quiz', name: 'Kvíz' });
    if (currentLessonData.test) availableTabs.push({ id: 'test', name: 'Test' });
    if (currentLessonData.podcast_script) availableTabs.push({ id: 'podcast', name: 'Podcast' });
    
    availableTabs.forEach((tab, index) => {
        const tabEl = document.createElement('button');
        tabEl.id = `${tab.id}-tab`;
        tabEl.className = 'px-6 py-3 font-semibold border-b-2 transition-colors';
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

/**
 * Prepne na vybranú záložku.
 */
function switchTab(tabId) {
    document.querySelectorAll('#lesson-tabs button').forEach(btn => {
        btn.classList.remove('border-green-700', 'text-green-700');
        btn.classList.add('border-transparent', 'text-slate-500', 'hover:text-green-700');
    });
    document.getElementById(`${tabId}-tab`).classList.add('border-green-700', 'text-green-700');

    const contentArea = document.getElementById('lesson-tab-content');
    switch (tabId) {
        case 'text':
            contentArea.innerHTML = `<div class="prose max-w-none">${currentLessonData.text_content}</div>`;
            break;
        case 'video':
            const videoId = currentLessonData.youtube_link.split('v=')[1];
            contentArea.innerHTML = `<iframe class="w-full aspect-video rounded-lg" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>`;
            break;
        case 'quiz':
            renderQuiz();
            break;
        case 'test':
            renderTest();
            break;
        case 'podcast':
            // Tu by bola logika pre podcast
            contentArea.innerHTML = `<p>Podcast pre túto lekciu bude dostupný čoskoro.</p>`;
            break;
    }
}

/**
 * Vykreslí kvíz.
 */
function renderQuiz() {
    const quiz = currentLessonData.quiz;
    const contentArea = document.getElementById('lesson-tab-content');
    let html = `<h3 class="text-xl font-bold mb-4">${quiz.title}</h3>`;

    quiz.questions.forEach((q, index) => {
        html += `<div class="mb-6" id="question-${index}">
                    <p class="font-semibold mb-2">${index + 1}. ${q.question}</p>`;
        q.options.forEach(option => {
            html += `<label class="block p-2 border rounded hover:bg-slate-50">
                        <input type="radio" name="q${index}" value="${option}" class="mr-2">
                        ${option}
                     </label>`;
        });
        html += `</div>`;
    });
    html += `<button id="submit-quiz" class="bg-green-700 text-white font-bold py-2 px-4 rounded-lg">Odevzdat kvíz</button>`;
    contentArea.innerHTML = html;

    document.getElementById('submit-quiz').addEventListener('click', async () => {
        let score = 0;
        const userAnswers = [];
        quiz.questions.forEach((q, index) => {
            const selected = document.querySelector(`input[name="q${index}"]:checked`);
            userAnswers.push({ question: q.question, answer: selected ? selected.value : "Nezodpovězeno" });
            if (selected && selected.value === q.correctAnswer) {
                score++;
            }
        });
        
        try {
            await submitQuizResults({ 
                lessonId: currentLessonId, 
                quizTitle: quiz.title, 
                score: score, 
                total: quiz.questions.length,
                answers: userAnswers
            });
            contentArea.innerHTML = `<h3 class="text-xl font-bold">Výsledky kvízu</h3>
                                     <p class="text-2xl mt-4">Vaše skóre: ${score} / ${quiz.questions.length}</p>`;
            showToast("Kvíz úspěšně odevzdán!");
        } catch (error) {
            showToast("Nepodařilo se odevzdat kvíz.", true);
            console.error("Error submitting quiz:", error);
        }
    });
}

/**
 * Vykreslí test.
 */
function renderTest() {
    // Podobná logika ako pre renderQuiz
    const contentArea = document.getElementById('lesson-tab-content');
    contentArea.innerHTML = `<p>Test pre túto lekciu bude dostupný čoskoro.</p>`;
}

/**
 * Načíta históriu chatu.
 */
async function loadChatHistory() {
    const chatHistoryEl = document.getElementById('chat-history');
    chatHistoryEl.innerHTML = 'Načítání konverzace...';
    try {
        const q = query(
            collection(db, `conversations/${currentUserData.id}/messages`),
            where("lessonId", "==", currentLessonId),
            orderBy("timestamp", "asc")
        );
        onSnapshot(q, (snapshot) => {
            chatHistoryEl.innerHTML = '';
            if (snapshot.empty) {
                chatHistoryEl.innerHTML = '<p class="text-center text-slate-400">Začněte konverzaci...</p>';
                return;
            }
            snapshot.docs.forEach(doc => {
                appendChatMessage(doc.data());
            });
        }, (error) => {
            console.error("Error with chat listener:", error);
            chatHistoryEl.innerHTML = '<p class="text-red-500">Chyba pri načítavaní konverzácie.</p>';
        });
    } catch (error) {
        console.error("Error loading chat history:", error);
        chatHistoryEl.innerHTML = '<p class="text-red-500">Nepodařilo se načíst konverzaci.</p>';
    }
}

/**
 * Odošle správu (AI alebo profesorovi).
 */
async function sendMessage(type) {
    const inputEl = document.getElementById('chat-input');
    const text = inputEl.value.trim();
    if (!text) return;
    
    inputEl.value = '';
    const messageData = {
        lessonId: currentLessonId,
        studentId: currentUserData.id,
        text: text,
        sender: 'student',
        type: type,
        timestamp: serverTimestamp() // Pridáme timestamp
    };

    try {
        await sendMessageFromStudent(messageData);
        // onSnapshot sa postará o zobrazenie odoslanej správy
    } catch (error) {
        console.error("Error sending message:", error);
        showToast("Nepodařilo se odeslat zprávu.", true);
    }
}

/**
 * Pridá správu do okna chatu.
 */
function appendChatMessage(data) {
    const chatHistoryEl = document.getElementById('chat-history');
    const msgDiv = document.createElement('div');
    msgDiv.className = `p-3 my-2 rounded-lg max-w-xl clear-both`;
    let senderPrefix = '';

    if (data.sender === 'student') {
        msgDiv.classList.add('bg-blue-500', 'text-white', 'ml-auto', 'rounded-br-none', 'float-right');
    } else {
        msgDiv.classList.add('bg-slate-200', 'text-slate-800', 'mr-auto', 'rounded-bl-none', 'float-left');
        senderPrefix = data.sender === 'ai' ? '<strong>AI Asistent:</strong> ' : '<strong>Profesor:</strong> ';
    }
    
    msgDiv.innerHTML = senderPrefix + data.text;
    chatHistoryEl.appendChild(msgDiv);
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}
