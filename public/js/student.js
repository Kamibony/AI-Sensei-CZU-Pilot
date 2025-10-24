import { collection, getDocs, doc, query, where, updateDoc, orderBy, onSnapshot, addDoc, serverTimestamp, setDoc, Timestamp, documentId } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"; // Pridaný Timestamp a documentId
import { showToast } from './utils.js';
import * as firebaseInit from './firebase-init.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { handleLogout } from './auth.js';
import { getAiAssistantResponse } from './gemini-api.js';
// ===== NOVÝ IMPORT pre prezentáciu =====
import { renderPresentation } from './student/presentation-handler.js';
// =====================================

let studentDataUnsubscribe = null;
let lessonsData = [];
let currentUserData = null;
let currentLessonData = null;
let currentLessonId = null;

let _sendMessageFromStudentCallable = null;
let _submitQuizResultsCallable = null;
let _submitTestResultsCallable = null;

// ===== Premenné pre Speech Synthesis =====
let currentSpeechUtterance = null;
let currentPlayingEpisodeIndex = -1;
// ======================================

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

function getSubmitQuizResultsCallable() {
    if (!_submitQuizResultsCallable) {
        // console.log("Lazy initializing submitQuizResults callable. Current functions object:", firebaseInit.functions); // Odstránené logovanie
        if (!firebaseInit.functions) {
            console.error("CRITICAL: Firebase Functions object is still not available when trying to create submitQuizResults callable!");
            throw new Error("Firebase Functions not initialized.");
        }
        _submitQuizResultsCallable = httpsCallable(firebaseInit.functions, 'submitQuizResults');
    }
    return _submitQuizResultsCallable;
}

function getSubmitTestResultsCallable() {
    if (!_submitTestResultsCallable) {
        // console.log("Lazy initializing submitTestResults callable. Current functions object:", firebaseInit.functions); // Odstránené logovanie
        if (!firebaseInit.functions) {
            console.error("CRITICAL: Firebase Functions object is still not available when trying to create submitTestResults callable!");
            throw new Error("Firebase Functions not initialized.");
        }
        _submitTestResultsCallable = httpsCallable(firebaseInit.functions, 'submitTestResults');
    }
    return _submitTestResultsCallable;
}


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
    currentSpeechUtterance = null;
    currentPlayingEpisodeIndex = -1;
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

// ===== UPRAVENÁ FUNKCIA fetchAndDisplayLessons (RIEŠENIE 2) =====
async function fetchAndDisplayLessons() {
    const mainContent = document.getElementById('student-main-content');
    mainContent.innerHTML = `<h2 class="text-2xl font-bold mb-6 text-slate-800">Moje lekce</h2>
                             <div id="lessons-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">Načítání lekcí...</div>`;
    const lessonsGrid = document.getElementById('lessons-grid'); // Získame grid hneď

    try {
        // ===== IMPLEMENTÁCIA RIEŠENIA 2 =====

        // 1. Načítať všetky udalosti z časovej osi
        const timelineEventsQuery = query(collection(firebaseInit.db, "timeline_events"));
        const timelineSnapshot = await getDocs(timelineEventsQuery);

        // 2. Získať unikátne lessonId
        const scheduledLessonIds = timelineSnapshot.docs
            .map(doc => doc.data().lessonId) // Získať všetky lessonId
            .filter(id => id); // Odfiltrovať prípadné prázdne (null, undefined, "") hodnoty

        const uniqueLessonIds = [...new Set(scheduledLessonIds)]; // Vytvoriť unikátny zoznam

        // 3. Skontrolovať, či sú nejaké lekcie na zobrazenie
        if (uniqueLessonIds.length === 0) {
            lessonsGrid.innerHTML = `<p class="text-slate-500">Zatím vám nebyly přiřazeny žádné lekcie.</p>`;
            lessonsData = []; // Vyčistiť globálne dáta
            return;
        }

        // 4. Ošetriť limit 30 pre 'in' query
        let lessonIdsToQuery = uniqueLessonIds;
        if (uniqueLessonIds.length > 30) {
            console.warn(`Nalezeno více než 30 naplánovaných lekcí (${uniqueLessonIds.length}). Zobrazuji pouze prvních 30. Pro plnou funkčnost je potřeba implementovat Riešenie 3 (Cloud Function).`);
            lessonIdsToQuery = uniqueLessonIds.slice(0, 30);
        }

        // 5. Načítať iba lekcie, ktoré sú v časovej osi
        // Použijeme 'documentId()' na filtrovanie podľa IDčiek
        const q = query(collection(firebaseInit.db, "lessons"), where(documentId(), 'in', lessonIdsToQuery));
        
        const querySnapshot = await getDocs(q);
        let fetchedLessons = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 6. Zoradiť dáta na klientovi (keďže 'orderBy' sa nedá kombinovať s 'in' na documentId())
        // Triedime podľa 'createdAt' zostupne (najnovšie prvé)
        fetchedLessons.sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
        });

        lessonsData = fetchedLessons; // Uložíme do globálnej premennej

        // ===== KONIEC RIEŠENIA 2 =====


        if (lessonsData.length === 0) {
            // Táto podmienka sa technicky splní aj v kroku 3, ale pre istotu
            lessonsGrid.innerHTML = `<p class="text-slate-500">Nebyly nalezeny žádné lekce odpovídající plánu.</p>`;
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
// ===== KONIEC UPRAVENEJ FUNKCIE =====

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
    currentSpeechUtterance = null;
    currentPlayingEpisodeIndex = -1;
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
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        // Resetujeme stav tlačidiel v podcast tabe (ak tam sme boli)
        resetPodcastButtons(); 
    }
    currentSpeechUtterance = null;
    currentPlayingEpisodeIndex = -1;

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
        // ===== ÚPRAVA PRE PREZENTÁCIU =====
        case 'presentation':
             renderPresentation(contentArea, currentLessonData.presentation);
             break;
        // ===================================
        case 'quiz':
            renderQuiz();
            break;
        case 'test':
            renderTest();
            break;
        case 'podcast':
            if (currentLessonData.podcast_script && currentLessonData.podcast_script.episodes && Array.isArray(currentLessonData.podcast_script.episodes)) {
                if (!('speechSynthesis' in window)) {
                     contentArea.innerHTML = `<p class="text-red-500">Váš prohlížeč nepodporuje přehrávání podcastů pomocí Speech Synthesis.</p>`;
                     break;
                }
                
                contentArea.innerHTML = currentLessonData.podcast_script.episodes.map((episode, i) => {
                    const episodeId = `podcast-episode-${i}`;
                    const playButtonId = `play-podcast-btn-${i}`;
                    const pauseButtonId = `pause-podcast-btn-${i}`;
                    const stopButtonId = `stop-podcast-btn-${i}`;
                    
                    return `
                        <div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm bg-white" id="${episodeId}">
                            <h4 class="font-bold text-green-700">${i + 1}. ${episode.title || 'Epizoda bez názvu'}</h4>
                            <div class="flex space-x-2 mt-3 mb-2 podcast-controls" data-episode-index="${i}">
                                <button id="${playButtonId}" data-index="${i}" class="play-podcast-btn text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-3 rounded-md flex items-center">
                                    <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>
                                    Přehrát
                                </button>
                                <button id="${pauseButtonId}" data-index="${i}" class="pause-podcast-btn text-sm bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-1.5 px-3 rounded-md flex items-center hidden">
                                     <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clip-rule="evenodd"></path></svg>
                                     Pozastavit
                                </button>
                                <button id="${stopButtonId}" data-index="${i}" class="stop-podcast-btn text-sm bg-red-600 hover:bg-red-700 text-white font-semibold py-1.5 px-3 rounded-md flex items-center">
                                    <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 9a1 1 0 00-1 1v1a1 1 0 102 0v-1a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v1a1 1 0 102 0v-1a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
                                    Zastavit
                                </button>
                            </div>
                            <details class="mt-3">
                                <summary class="cursor-pointer text-sm text-slate-500 hover:text-slate-700">Zobrazit skript</summary>
                                <p class="mt-2 text-sm text-slate-600">${(episode.script || '').replace(/\n/g, '<br>')}</p>
                            </details>
                        </div>`;
                }).join('');
                setupPodcastListeners();
            } else {
                contentArea.innerHTML = `<p>Obsah podcastu není k dispozici nebo není ve správném formátu.</p>`;
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

// Funkcie pre podcast zostávajú nezmenené (alebo s opravou z predchádzajúcej správy)
function setupPodcastListeners() {
    document.querySelectorAll('.play-podcast-btn').forEach(button => {
        button.addEventListener('click', handlePlayPodcast);
    });
    document.querySelectorAll('.pause-podcast-btn').forEach(button => {
        button.addEventListener('click', handlePausePodcast);
    });
    document.querySelectorAll('.stop-podcast-btn').forEach(button => {
        button.addEventListener('click', handleStopPodcast);
    });
}

function handlePlayPodcast(event) {
    const index = parseInt(event.currentTarget.dataset.index, 10);
    const episodeData = currentLessonData.podcast_script.episodes[index];
    const script = episodeData.script;
    if (!script) {
        showToast("Skript pro tuto epizodu chybí.", true);
        return;
    }

    const synth = window.speechSynthesis;
    if (synth.speaking && currentPlayingEpisodeIndex === index && synth.paused) {
        // Ak je tá istá epizóda pozastavená, pokračujeme
        synth.resume();
        updatePodcastButtons(index, true); // Zobraziť ako hrajúcu
    } else {
        // Ak hovorí niečo iné, alebo je to nová epizóda
        if (synth.speaking) {
            synth.cancel(); // Zastaviť predchádzajúce
        }
        
        // Vytvorenie nového utterance
        currentSpeechUtterance = new SpeechSynthesisUtterance(script);
        currentSpeechUtterance.lang = 'cs-CZ'; // Nastavenie jazyka
        currentPlayingEpisodeIndex = index;

        // Event listener pre koniec (prirodzený alebo cancel())
        currentSpeechUtterance.onend = () => {
             console.log('Speech finished or cancelled.');
             resetPodcastButtons(); // Resetovať všetky tlačidlá
             currentPlayingEpisodeIndex = -1;
             currentSpeechUtterance = null;
        };

        // ===== UPRAVENÝ Event listener pre chybu (ignoruje 'cancel') =====
        currentSpeechUtterance.onerror = (event) => {
            // Ignorujeme chyby spôsobené úmyselným zastavením
            if (event.error === 'canceled' || event.error === 'interrupted' || event.error === 'cancel') {
                console.log(`Speech synthesis intentionally stopped: ${event.error}`);
                // Nerobíme nič - onend sa postará o reset
            } else {
                // Skutočná chyba pri prehrávaní
                console.error('SpeechSynthesisUtterance.onerror', event);
                showToast(`Chyba při přehrávání: ${event.error}`, true);
                resetPodcastButtons(); // Resetujeme aj tu pre istotu
                currentPlayingEpisodeIndex = -1;
                currentSpeechUtterance = null;
            }
        };
        // ===== KONIEC ÚPRAVY =====
        
        // Hľadanie českého hlasu (voliteľné)
        try { // getVoices() môže niekedy zlyhať pri prvom načítaní
             const voices = synth.getVoices();
             const czechVoice = voices.find(voice => voice.lang === 'cs-CZ');
             if (czechVoice) {
                 currentSpeechUtterance.voice = czechVoice;
             } else {
                 console.warn("Český hlas nenalezen, použije se výchozí.");
             }
         } catch (e) {
             console.warn("Nepodařilo se získat seznam hlasů:", e);
         }

        // Spustenie syntézy
        // Niekedy je potrebné počkať na načítanie hlasov, pridáme malý timeout pre istotu
        setTimeout(() => {
            if (currentSpeechUtterance && window.speechSynthesis) { // Overíme, či medzitým nebol zrušený a API existuje
                 try {
                     synth.speak(currentSpeechUtterance);
                     updatePodcastButtons(index, true); // Zobraziť ako hrajúcu
                 } catch (e) {
                      console.error("Error calling synth.speak:", e);
                      showToast("Chyba při spuštění přehrávání.", true);
                      resetPodcastButtons();
                      currentPlayingEpisodeIndex = -1;
                      currentSpeechUtterance = null;
                 }
            }
        }, 100); // 100ms by malo stačiť
    }
}


function handlePausePodcast() {
    const synth = window.speechSynthesis;
    if (synth && synth.speaking && !synth.paused) {
        synth.pause();
        updatePodcastButtons(currentPlayingEpisodeIndex, false); // Zobraziť ako pauznutú
    }
}

function handleStopPodcast() {
    const synth = window.speechSynthesis;
    if (synth && synth.speaking) {
        synth.cancel(); // Toto spustí 'onend' listener
    }
    // Reset sa udeje v 'onend'
}

function updatePodcastButtons(index, isPlaying) {
    resetPodcastButtons(); // Najprv resetujeme všetky

    const playBtn = document.getElementById(`play-podcast-btn-${index}`);
    const pauseBtn = document.getElementById(`pause-podcast-btn-${index}`);
    
    if (playBtn && pauseBtn) {
        if (isPlaying) {
            playBtn.classList.add('hidden');
            pauseBtn.classList.remove('hidden');
        } else { // Je pauznutá
            playBtn.classList.remove('hidden');
            playBtn.innerHTML = `<svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg> Pokračovat`;
            pauseBtn.classList.add('hidden');
        }
    }
}

function resetPodcastButtons() {
     document.querySelectorAll('.podcast-controls').forEach(controls => {
         const index = controls.dataset.episodeIndex;
         const playBtn = document.getElementById(`play-podcast-btn-${index}`);
         const pauseBtn = document.getElementById(`pause-podcast-btn-${index}`);
         if (playBtn && pauseBtn) {
             playBtn.classList.remove('hidden');
             playBtn.innerHTML = `<svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg> Přehrát`;
             pauseBtn.classList.add('hidden');
         }
     });
}


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
            <div id="prof-chat-history" class="overflow-y-auto border p-3 rounded-lg bg-slate-50 mb-4 flex-grow"></div> {/* Odstránená fixná výška */}
            <div class="flex gap-2 flex-shrink-0"> {/* Pridané flex-shrink-0 */}
                <input type="text" id="prof-chat-input" placeholder="Zadejte dotaz pro profesora..." class="flex-grow p-3 border rounded-lg focus:ring-2 focus:ring-blue-500">
                <button id="send-prof-btn" class="bg-slate-700 text-white font-bold py-3 px-5 rounded-lg hover:bg-slate-800 transition-colors">Odeslat</button>
            </div>
        </div>
    `;
}


function renderQuiz() {
    // ... (kód zostáva nezmenený)
    const quiz = currentLessonData?.quiz; // Bezpečnejší prístup
    if (!quiz || !quiz.questions || !Array.isArray(quiz.questions)) { // Pridaná kontrola Array.isArray
        document.getElementById('lesson-tab-content').innerHTML = `<p>Obsah kvízu není k dispozici nebo není ve správném formátu.</p>`;
        return;
    }

    const contentArea = document.getElementById('lesson-tab-content');
    let html = `<h3 class="text-xl md:text-2xl font-bold mb-4">${quiz.title || 'Kvíz'}</h3>`;

    quiz.questions.forEach((q, index) => {
        html += `<div class="mb-6 p-4 border border-gray-200 rounded-lg bg-white shadow-sm" id="question-container-${index}">
                    <p class="font-semibold mb-3 text-lg">${index + 1}. ${q.question_text || 'Chybějící text otázky'}</p>`; // Fallback
        (q.options || []).forEach((option, optionIndex) => {
            html += `<label class="block p-3 border border-gray-300 rounded-md mb-2 cursor-pointer hover:bg-slate-50 transition-colors" id="option-label-${index}-${optionIndex}">
                        <input type="radio" name="q${index}" value="${option}" class="mr-3 transform scale-110 text-green-600">
                        ${option}
                     </label>`;
        });
        html += `<div id="feedback-${index}" class="mt-2 font-bold text-sm"></div>`; 
        html += `</div>`;
    });
    html += `<button id="submit-quiz" class="w-full bg-green-700 text-white font-bold py-3 px-4 rounded-lg text-lg hover:bg-green-800 transition-colors">Odevzdat kvíz</button>`;
    contentArea.innerHTML = html;

    const submitButton = document.getElementById('submit-quiz');
    if (submitButton) { // Pridaná kontrola
        submitButton.addEventListener('click', async () => {
            const userAnswers = [];
            let allAnswered = true;

            quiz.questions.forEach((q, index) => {
                const selected = document.querySelector(`input[name="q${index}"]:checked`);
                const userAnswerText = selected ? selected.value : null; // null ak nie je zodpovedané
                userAnswers.push({ question: q.question_text, answer: userAnswerText });
                if (userAnswerText === null) {
                    allAnswered = false;
                }
            });
            
            if (!allAnswered) {
                 showToast("Prosím, odpovězte na všechny otázky!", true);
                 return;
            }

            // Vyhodnotenie a zobrazenie výsledkov
            const score = displayQuizResults(quiz, userAnswers); 
            
            // Odoslanie na backend
            try {
                const submitCallable = getSubmitQuizResultsCallable();
                await submitCallable({ 
                    lessonId: currentLessonId, 
                    quizTitle: quiz.title || 'Kvíz', 
                    score: score / quiz.questions.length, // Skóre ako 0-1
                    totalQuestions: quiz.questions.length,
                    answers: userAnswers // Posielame null pre nezodpovedané, hoci sme to už overili
                });
                showToast("Kvíz úspěšně odevzdán a vyhodnocen!");
            } catch (error) {
                showToast("Nepodařilo se odevzdat kvíz do databáze.", true);
                console.error("Error submitting quiz:", error);
            }
        });
    }
}

function displayQuizResults(quiz, userAnswers) {
    // ... (kód zostáva nezmenený)
    const contentArea = document.getElementById('lesson-tab-content');
    let score = 0;
    
    document.getElementById('submit-quiz')?.remove();

    quiz.questions.forEach((q, index) => {
        const correctOptionIndex = q.correct_option_index;
        // Kontrola, či index existuje a je v rozsahu
        const correctOption = (typeof correctOptionIndex === 'number' && q.options && q.options[correctOptionIndex]) 
                               ? q.options[correctOptionIndex] 
                               : 'N/A (Chyba v datech)'; 
        
        const userAnswerData = userAnswers.find(ua => ua.question === q.question_text);
        const userAnswer = userAnswerData ? userAnswerData.answer : null;
        
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
            ? `<span class="text-green-600">✅ Správně!</span>`
            : `<span class="text-red-600">❌ Chyba. Správná odpověď: <strong>${correctOption}</strong></span>`;
        
        feedbackEl.innerHTML = userFeedbackText;

        (q.options || []).forEach((option, optionIndex) => {
            const labelEl = document.getElementById(`option-label-${index}-${optionIndex}`);
            const inputEl = labelEl ? labelEl.querySelector('input') : null;
            if (!labelEl || !inputEl) return;
            
            inputEl.disabled = true; // Zneaktívnime všetky možnosti

            // Zvýraznenie správnej a používateľovej odpovede
            if (optionIndex === correctOptionIndex) {
                labelEl.classList.remove('border-gray-300', 'hover:bg-slate-50');
                labelEl.classList.add('bg-green-100', 'border-green-500', 'font-semibold');
            } else if (option === userAnswer && !isCorrect) { // Zvýrazniť nesprávnu voľbu používateľa
                labelEl.classList.remove('border-gray-300', 'hover:bg-slate-50');
                labelEl.classList.add('bg-red-100', 'border-red-500', 'line-through');
            } else {
                // Ostatné možnosti necháme bez špeciálneho štýlu, len disabled
                 labelEl.classList.remove('hover:bg-slate-50');
                 labelEl.classList.add('cursor-default', 'opacity-70');
            }
        });
    });

    const scoreHtml = `
        <div class="text-center p-6 mb-6 rounded-xl bg-green-700 text-white shadow-lg">
            <h3 class="text-xl md:text-2xl font-bold">Váš konečný výsledek kvízu</h3>
            <p class="text-3xl md:text-4xl font-extrabold mt-2">${score} / ${quiz.questions.length}</p>
        </div>
    `;
    contentArea?.insertAdjacentHTML('afterbegin', scoreHtml); // Pridaná kontrola
    return score; // Vrátime skóre pre odoslanie na backend
}


function renderTest() {
    // ... (kód zostáva nezmenený)
    const test = currentLessonData?.test;
    if (!test || !test.questions || !Array.isArray(test.questions) || test.questions.length === 0) {
        document.getElementById('lesson-tab-content').innerHTML = `<p>Obsah testu není k dispozici nebo není ve správném formátu.</p>`;
        return;
    }

    const contentArea = document.getElementById('lesson-tab-content');
    let html = `<h3 class="text-xl md:text-2xl font-bold mb-4">${test.title || 'Test'}</h3>
                <p class="text-slate-600 mb-6">Odpovězte na všechny otázky. Výsledky testu se započítají do vašeho hodnocení.</p>`;

    test.questions.forEach((q, index) => {
        html += `<div class="mb-6 p-4 border border-gray-200 rounded-lg bg-white shadow-sm" id="test-question-container-${index}">
                    <p class="font-semibold mb-3 text-lg">${index + 1}. ${q.question_text || 'Chybějící text otázky'}</p>`;
        (q.options || []).forEach((option, optionIndex) => {
            html += `<label class="block p-3 border border-gray-300 rounded-md mb-2 cursor-pointer hover:bg-slate-50 transition-colors" id="test-option-label-${index}-${optionIndex}">
                        <input type="radio" name="t${index}" value="${option}" class="mr-3 transform scale-110 text-green-600">
                        ${option}
                     </label>`;
        });
        html += `<div id="test-feedback-${index}" class="mt-2 font-bold text-sm"></div>`; 
        html += `</div>`;
    });
    html += `<button id="submit-test" class="w-full bg-green-700 text-white font-bold py-3 px-4 rounded-lg text-lg hover:bg-green-800 transition-colors">Odevzdat test</button>`;
    contentArea.innerHTML = html;

    const submitButton = document.getElementById('submit-test');
    if (submitButton) {
        submitButton.addEventListener('click', async () => {
            const userAnswers = [];
            let allAnswered = true;

            test.questions.forEach((q, index) => {
                const selected = document.querySelector(`input[name="t${index}"]:checked`);
                const userAnswerText = selected ? selected.value : null; 
                userAnswers.push({ question: q.question_text, answer: userAnswerText });
                if (userAnswerText === null) {
                    allAnswered = false;
                }
            });
            
            if (!allAnswered) {
                 showToast("Prosím, odpovězte na všechny otázky!", true);
                 return;
            }

            const score = displayTestResults(test, userAnswers); 
            
            try {
                const submitCallable = getSubmitTestResultsCallable();
                await submitCallable({ 
                    lessonId: currentLessonId, 
                    testTitle: test.title || 'Test', 
                    score: score / test.questions.length,
                    totalQuestions: test.questions.length,
                    answers: userAnswers
                });
                showToast("Test úspěšně odevzdán a vyhodnocen!");
            } catch (error) {
                showToast("Nepodařilo se odevzdat test do databáze.", true);
                console.error("Error submitting test:", error);
            }
        });
    }
}


function displayTestResults(test, userAnswers) {
    // ... (kód zostáva nezmenený)
    const contentArea = document.getElementById('lesson-tab-content');
    let score = 0;
    
    document.getElementById('submit-test')?.remove();

    test.questions.forEach((q, index) => {
        const correctOptionIndex = q.correct_option_index;
        const correctOption = (typeof correctOptionIndex === 'number' && q.options && q.options[correctOptionIndex]) 
                               ? q.options[correctOptionIndex] 
                               : 'N/A (Chyba v datech)'; 
        
        const userAnswerData = userAnswers.find(ua => ua.question === q.question_text);
        const userAnswer = userAnswerData ? userAnswerData.answer : null;
        
        const isCorrect = userAnswer === correctOption;
        if (isCorrect) {
            score++;
        }
        
        const questionContainer = document.getElementById(`test-question-container-${index}`);
        const feedbackEl = document.getElementById(`test-feedback-${index}`);
        if (!questionContainer || !feedbackEl) return;

        questionContainer.classList.remove('border-gray-200');
        questionContainer.classList.add(isCorrect ? 'border-green-500' : 'border-red-500');
        
        const userFeedbackText = isCorrect 
            ? `<span class="text-green-600">✅ Správně!</span>`
            : `<span class="text-red-600">❌ Chyba. Správná odpověď: <strong>${correctOption}</strong></span>`;
        
        feedbackEl.innerHTML = userFeedbackText;

        (q.options || []).forEach((option, optionIndex) => {
            const labelEl = document.getElementById(`test-option-label-${index}-${optionIndex}`);
            const inputEl = labelEl ? labelEl.querySelector('input') : null;
            if (!labelEl || !inputEl) return;
            
            inputEl.disabled = true;

            if (optionIndex === correctOptionIndex) {
                labelEl.classList.remove('border-gray-300', 'hover:bg-slate-50');
                labelEl.classList.add('bg-green-100', 'border-green-500', 'font-semibold');
            } else if (option === userAnswer && !isCorrect) {
                labelEl.classList.remove('border-gray-300', 'hover:bg-slate-50');
                labelEl.classList.add('bg-red-100', 'border-red-500', 'line-through');
            } else {
                 labelEl.classList.remove('hover:bg-slate-50');
                 labelEl.classList.add('cursor-default', 'opacity-70');
            }
        });
    });

    const scoreHtml = `
        <div class="text-center p-6 mb-6 rounded-xl bg-green-700 text-white shadow-lg">
            <h3 class="text-xl md:text-2xl font-bold">Váš konečný výsledek testu</h3>
            <p class="text-3xl md:text-4xl font-extrabold mt-2">${score} / ${test.questions.length}</p>
        </div>
    `;
    contentArea?.insertAdjacentHTML('afterbegin', scoreHtml); // Pridaná kontrola
    return score;
}


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
        // Použijeme onSnapshot pre real-time aktualizácie
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const currentChatHistoryEl = document.getElementById(chatHistoryElId); // Znova nájdeme element
            if (!currentChatHistoryEl) return; // Ak medzitým používateľ prešiel inam

            currentChatHistoryEl.innerHTML = ''; // Vyčistiť pred naplnením
            if (snapshot.empty) {
                currentChatHistoryEl.innerHTML = `<p class="text-center text-slate-400 p-4">Začněte konverzaci...</p>`;
            } else {
                snapshot.docs.forEach(doc => {
                    appendChatMessage(doc.data(), type, chatHistoryElId);
                });
                 // Scroll to bottom after rendering messages
                 currentChatHistoryEl.scrollTop = currentChatHistoryEl.scrollHeight;
            }
        }, (error) => {
            console.error(`Error with ${type} chat listener:`, error);
            const currentChatHistoryEl = document.getElementById(chatHistoryElId);
            if (currentChatHistoryEl) {
                currentChatHistoryEl.innerHTML = '<p class="text-red-500 p-4 text-center">Chyba při načítání konverzace.</p>';
            }
        });
        // Uloženie unsubscribe funkcie (potrebujeme pre cleanup pri prepnutí tabu/lekcie)
        // TODO: Manažovať tieto unsubscribe funkcie lepšie
        // if (type === 'ai') aiChatUnsubscribe = unsubscribe;
        // else professorChatUnsubscribe = unsubscribe;

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

    inputEl.value = ''; // Vyčistíme input hneď

    const messageData = { 
        lessonId: currentLessonId, 
        text: text,
        sender: 'student',
        type: type, // 'ai' alebo 'professor'
        timestamp: serverTimestamp() 
    };

    try {
         // 1. Uložíme správu študenta do DB
         const messageRef = collection(firebaseInit.db, `conversations/${currentUserData.id}/messages`);
         await addDoc(messageRef, messageData);
         console.log(`Student message saved to DB for type: ${type}`);

         // Zobrazenie v UI už rieši onSnapshot

         // 2. Ak je pre AI, získame odpoveď
         if (type === 'ai') {
            const chatHistoryEl = document.getElementById('ai-chat-history');
            const typingIndicator = appendChatMessage({ text: '...', sender: 'ai-typing' }, 'ai', 'ai-chat-history'); // Zobrazíme indikátor písania

            try {
                const response = await getAiAssistantResponse({
                    lessonId: currentLessonId,
                    userQuestion: text
                });
                
                typingIndicator?.remove(); // Odstránime indikátor

                let aiResponseText = '';
                if (response.error) {
                     aiResponseText = `Chyba AI: ${response.error}`;
                } else {
                     aiResponseText = response.answer || "Omlouvám se, nedostal jsem odpověď.";
                }

                // Uloženie odpovede AI do DB
                 await addDoc(messageRef, {
                     lessonId: currentLessonId,
                     text: aiResponseText,
                     sender: 'ai',
                     type: 'ai',
                     timestamp: serverTimestamp()
                 });
                 console.log("AI response saved to DB.");
                 // Zobrazenie v UI opäť rieši onSnapshot

            } catch (aiError) {
                console.error("Error getting AI response:", aiError);
                typingIndicator?.remove();
                const errorText = `Omlouvám se, došlo k chybě při komunikaci s AI: ${aiError.message || aiError}`;
                // Uloženie chybovej odpovede AI do DB
                 try {
                     await addDoc(messageRef, {
                         lessonId: currentLessonId,
                         text: errorText,
                         sender: 'ai', // Alebo 'system-error'?
                         type: 'ai',
                         timestamp: serverTimestamp()
                     });
                 } catch(dbError) {
                      console.error("Error saving AI error response to DB:", dbError);
                 }
                 // Zobrazenie v UI opäť rieši onSnapshot
            }

        } else { // Ak je pre profesora
            // Backend by mal byť volaný len na notifikáciu profesora,
            // správu už ukladá frontend (a onSnapshot ju zobrazí)
            try {
                const notifyProfessorCallable = getSendMessageFromStudentCallable(); // Premenujeme pre jasnosť
                await notifyProfessorCallable({ text: text }); // Posielame len text pre notifikáciu
            } catch (callError) {
                 console.error("Error notifying professor:", callError);
                 showToast("Nepodařilo se upozornit profesora na zprávu.", true);
                 // Správa je už v DB, takže sa zobrazí, ale notifikácia zlyhala
            }
        }
    } catch (error) {
        console.error("Error sending message or saving to DB:", error);
        showToast("Nepodařilo se odeslat zprávu.", true);
        // Ak ukladanie zlyhalo, onSnapshot správu nezobrazí. Môžeme zobraziť chybovú správu v UI?
        appendChatMessage({ text: `CHYBA: Zprávu "${text}" se nepodařilo odeslat.`, sender: 'system-error' }, type);
    }
}


function appendChatMessage(data, type, elementId = null) {
    // ... (kód zostáva nezmenený)
    const chatHistoryElId = elementId || (type === 'ai' ? 'ai-chat-history' : 'prof-chat-history');
    const chatHistoryEl = document.getElementById(chatHistoryElId);
    if (!chatHistoryEl) return null; 
    
    // Odstrániť placeholder "Začněte konverzaci", ak existuje
    const placeholder = chatHistoryEl.querySelector('p.text-slate-400');
    placeholder?.remove();

    const isAI = type === 'ai';

    const msgDiv = document.createElement('div');
    let baseClasses = 'p-2 px-3 my-1 rounded-lg text-sm clear-both max-w-[80%]'; // Pridané clear-both a max-w
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
         alignmentClasses = 'mx-auto'; // Centrovaná chybová správa
         msgDiv.className = `${baseClasses} bg-red-100 text-red-700 text-center ${alignmentClasses}`;
         senderPrefix = '<strong>Systém:</strong><br>';
    } else { // ai, professor
        alignmentClasses = 'mr-auto float-left';
        msgDiv.className = `${baseClasses} ${isAI ? 'bg-white' : 'bg-gray-200'} text-slate-800 ${alignmentClasses} rounded-tl-none`;
        if (data.sender === 'ai') senderPrefix = '<strong>AI Asistent:</strong><br>';
        if (data.sender === 'professor') senderPrefix = '<strong>Profesor:</strong><br>';
    }
    
    // Pridáme timestamp, ak je dostupný
    let timestampText = '';
    if (data.timestamp) {
         try {
             // ===== OPRAVA: Bezpečnejšia kontrola Timestamp =====
             const date = (data.timestamp && typeof data.timestamp.toDate === 'function') 
                          ? data.timestamp.toDate() 
                          : new Date(data.timestamp); // Fallback pre prípad, že to nie je Timestamp
             // ===============================================
             timestampText = `<span class="block text-xs ${data.sender === 'student' ? (isAI ? 'text-gray-500' : 'text-blue-200') : 'text-gray-400'} mt-1 text-right">${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
         } catch (e) { 
             console.warn("Error formatting timestamp:", data.timestamp, e);
         }
    }
    
    msgDiv.innerHTML = senderPrefix + (data.text || '').replace(/\n/g, '<br>') + timestampText;
    chatHistoryEl.appendChild(msgDiv);
    
    // Scroll to bottom only if the element is currently visible near the bottom
    const isScrolledToBottom = chatHistoryEl.scrollHeight - chatHistoryEl.clientHeight <= chatHistoryEl.scrollTop + 50; // Tolerancia 50px
    if (isScrolledToBottom || data.sender === 'student' || data.sender === 'ai-typing') { // Scroll vždy pre študenta a typing
        chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
    }

    return msgDiv; // Vrátime element pre prípadné odstránenie (napr. typing indicator)
}
