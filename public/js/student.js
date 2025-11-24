// Súbor: public/js/student.js
// Tento súbor je teraz "kontrolór" alebo "router" pre študentskú sekciu.

import { doc, onSnapshot, setDoc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { showToast } from './utils.js';
import * as firebaseInit from './firebase-init.js';
import { handleLogout } from './auth.js';

// Importujeme hlavné komponenty zobrazenia
import './student/student-lesson-list.js';
import './student/student-lesson-detail.js';
import './student/chat-panel.js';
import './views/student/student-dashboard-view.js';

// Globálny stav pre študentskú sekciu
let studentDataUnsubscribe = null;
let currentUserData = null;
let currentView = 'loading'; // 'loading', 'promptForName', 'home', 'courses', 'chat', 'profile', 'lessonDetail'
let selectedLessonId = null;
let previousView = 'home'; // For back navigation from detail

let mainContentElement = null; // Odkaz na hlavný kontajner

// --- JEDINÁ ZMENA: PREMENOVANIE FUNKCIE ---
export function initStudentApp() {
// -----------------------------------------
    const user = firebaseInit.auth.currentUser;
    if (!user) {
        console.error("Kritická chyba: initStudentApp bol spustený bez prihláseného používateľa!");
        document.getElementById('app-container').innerHTML = `<p class="p-8 text-center text-red-600">Nastala kritická chyba pri prihlasovaní. Skúste obnoviť stránku.</p>`;
        return;
    }

    if (studentDataUnsubscribe) studentDataUnsubscribe();

    const userDocRef = doc(firebaseInit.db, "students", user.uid);
    
    studentDataUnsubscribe = onSnapshot(userDocRef, async (docSnapshot) => {
        if (docSnapshot.exists()) {
            currentUserData = { id: docSnapshot.id, ...docSnapshot.data() };
            
            if (!currentUserData.name || currentUserData.name.trim() === '') {
                currentView = 'promptForName';
            } else {
                // Ak sme práve uložili meno, prepneme na home
                if (currentView === 'promptForName') {
                    currentView = 'home';
                }
                // Ak sme prišli prvýkrát, nastavíme home
                if (currentView === 'loading') {
                    currentView = 'home';
                }
            }
            
            // Renderujeme hlavný panel, ak ešte neexistuje
            if (!mainContentElement) {
                renderStudentPanel();
            }
            
            // Vždy prekreslíme obsah na základe aktuálneho stavu
            renderAppContent();
            updateActiveNavState();

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
                // onSnapshot sa spustí znova a nastaví currentView na 'promptForName'
            } catch (error) {
                console.error("Nepodarilo sa automaticky vytvoriť profil študenta:", error);
            }
        }
    }, (error) => {
        console.error("Chyba pri načítavaní profilu študenta:", error);
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
    mainContentElement = null; // Zabudneme na element pri odhlásení
    currentView = 'loading';
    selectedLessonId = null;
}

// Nová funkcia pre renderovanie panelu (natvrdo, bez template závislosti)
function renderStudentPanel() {
    const appContainer = document.getElementById('app-container');

    // Construct the layout manually to avoid missing template issues
    appContainer.innerHTML = `
        <div id="main-app" class="flex flex-col md:flex-row h-screen bg-slate-100">
            <nav id="main-nav" class="bg-green-800 p-2 md:flex flex-col items-center hidden md:w-20 lg:w-64 transition-all duration-300"></nav>
            <div id="role-content-wrapper" class="flex-grow flex flex-col overflow-y-auto pb-20 md:pb-0"></div>
            <nav id="mobile-bottom-nav" class="md:hidden w-full bg-white border-t border-slate-200 flex justify-around p-2 fixed bottom-0 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]"></nav>
        </div>
    `;

    mainContentElement = document.getElementById('role-content-wrapper');
    
    renderNavigation();

    // Listenery pre udalosti z komponentov
    mainContentElement.addEventListener('lesson-selected', (e) => {
        selectedLessonId = e.detail.lessonId;
        previousView = currentView === 'lessonDetail' ? previousView : currentView;
        currentView = 'lessonDetail';
        renderAppContent();
        updateActiveNavState();
    });

    mainContentElement.addEventListener('back-to-list', (e) => {
        selectedLessonId = null;
        currentView = previousView || 'courses';
        renderAppContent();
        updateActiveNavState();
    });
}

function renderNavigation() {
    const mobileNav = document.getElementById('mobile-bottom-nav');
    const desktopNav = document.getElementById('main-nav');

    // Mobile Bottom Nav
    if (mobileNav) {
        mobileNav.innerHTML = `
            <button data-nav="home" class="flex flex-col items-center justify-center w-full h-full text-slate-400 transition-all duration-200 group">
                <span class="text-2xl mb-1 transform group-active:scale-95 transition-transform">🏠</span>
                <span class="text-[10px] font-bold">Domů</span>
            </button>
            <button data-nav="courses" class="flex flex-col items-center justify-center w-full h-full text-slate-400 transition-all duration-200 group">
                <span class="text-2xl mb-1 transform group-active:scale-95 transition-transform">📚</span>
                <span class="text-[10px] font-bold">Kurzy</span>
            </button>
            <button data-nav="chat" class="flex flex-col items-center justify-center w-full h-full text-slate-400 transition-all duration-200 group">
                <span class="text-2xl mb-1 transform group-active:scale-95 transition-transform">💬</span>
                <span class="text-[10px] font-bold">Chat</span>
            </button>
            <button data-nav="profile" class="flex flex-col items-center justify-center w-full h-full text-slate-400 transition-all duration-200 group">
                <span class="text-2xl mb-1 transform group-active:scale-95 transition-transform">👤</span>
                <span class="text-[10px] font-bold">Profil</span>
            </button>
        `;
    }

    // Desktop Side Nav
    if (desktopNav) {
        desktopNav.innerHTML = `
            <div class="flex flex-col items-center w-full pt-8 space-y-8">
                <div class="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-4 border border-white/20 shadow-lg">
                    <span class="text-2xl">🎓</span>
                </div>

                <button data-nav="home" class="w-12 h-12 rounded-xl flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-all duration-200 group relative" title="Domů">
                    <span class="text-xl">🏠</span>
                </button>
                <button data-nav="courses" class="w-12 h-12 rounded-xl flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-all duration-200 group relative" title="Knihovna">
                    <span class="text-xl">📚</span>
                </button>
                <button data-nav="chat" class="w-12 h-12 rounded-xl flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-all duration-200 group relative" title="Chat">
                    <span class="text-xl">💬</span>
                </button>

                <div class="flex-grow"></div>

                <button data-nav="profile" class="w-12 h-12 rounded-xl flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-all duration-200 mb-8 group relative" title="Profil">
                    <span class="text-xl">👤</span>
                </button>
            </div>
        `;
    }

    const buttons = document.querySelectorAll('[data-nav]');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget.dataset.nav;
            switchView(target);
        });
    });
}

function switchView(viewName) {
    currentView = viewName;
    renderAppContent();
    updateActiveNavState();
}

function updateActiveNavState() {
    const activeTarget = currentView === 'lessonDetail' ? 'courses' : currentView;

    document.querySelectorAll('[data-nav]').forEach(btn => {
        const target = btn.dataset.nav;
        const isMobile = btn.parentElement.id === 'mobile-bottom-nav';

        if (target === activeTarget) {
            if (isMobile) {
                 btn.classList.remove('text-slate-400');
                 btn.classList.add('text-green-600', 'scale-110');
            } else {
                 btn.classList.remove('text-white/60');
                 btn.classList.add('bg-white/20', 'text-white', 'shadow-md');
            }
        } else {
            if (isMobile) {
                 btn.classList.add('text-slate-400');
                 btn.classList.remove('text-green-600', 'scale-110');
            } else {
                 btn.classList.add('text-white/60');
                 btn.classList.remove('bg-white/20', 'text-white', 'shadow-md');
            }
        }
    });
}

// Táto funkcia rozhoduje, ktorý komponent sa má zobraziť
function renderAppContent() {
    if (!mainContentElement || !currentUserData) return;

    switch (currentView) {
        case 'promptForName':
            mainContentElement.innerHTML = '';
            promptForStudentName(currentUserData.id);
            break;
            
        case 'home':
            mainContentElement.innerHTML = '<student-dashboard-view class="block p-4 md:p-8"></student-dashboard-view>';
            break;

        case 'courses':
        case 'lessonList': // Legacy fallback
            mainContentElement.innerHTML = '<student-lesson-list class="block p-4 md:p-8"></student-lesson-list>';
            break;

        case 'chat':
            // If we have a selectedLessonId and came from chat context (not implemented yet), show chat panel.
            // But generic chat view should list available chats.
            // Since we don't have a 'StudentChatListView', we will reuse 'student-lesson-list' wrapped in a way that
            // clicking a lesson opens the chat panel instead of lesson detail.

            // Alternatively, we can instantiate `student-lesson-list` and listen for `lesson-selected` event,
            // then hijack it to open chat.
            // But `student-lesson-list` dispatches bubbling event. We can catch it here if we modify `renderAppContent`.

            // Let's create a wrapper div that renders student-lesson-list but we add a specific class or attribute
            // to indicate intent? No, component doesn't support it.

            // Solution: Render a custom "Chat Selection" view here inline or new component.
            // Inline for simplicity as per plan.
            mainContentElement.innerHTML = `
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                     <h2 class="text-3xl font-extrabold mb-8 text-slate-800 tracking-tight">Chat a AI Asistent</h2>
                     <p class="text-slate-600 mb-6">Vyberte kurz pro zahájení chatu s AI nebo profesorem.</p>
                     <student-lesson-list id="chat-course-selector"></student-lesson-list>
                </div>
            `;

            // Add listener specifically for this list to open chat
            const chatSelector = mainContentElement.querySelector('#chat-course-selector');
            // We need to stop propagation of 'lesson-selected' from this specific element
            // and instead switch to chat view for that lesson.
            if(chatSelector) {
                chatSelector.addEventListener('lesson-selected', (e) => {
                    e.stopPropagation(); // Stop main listener from switching to lessonDetail
                    selectedLessonId = e.detail.lessonId;
                    openChatForLesson(selectedLessonId);
                });
            }
            break;

        case 'chat-detail': // New internal state for active chat
             mainContentElement.innerHTML = '';
             const chatPanel = document.createElement('chat-panel');
             chatPanel.type = 'ai'; // Default to AI, user can switch in UI if implemented
             chatPanel.lessonId = selectedLessonId;
             chatPanel.currentUserData = currentUserData;
             chatPanel.className = "block h-full p-4 md:p-8";

             // Add a back button header
             const header = document.createElement('div');
             header.className = "flex items-center p-4 md:px-8 bg-white border-b mb-4 sticky top-0 z-10";
             header.innerHTML = `
                <button id="back-to-chats" class="mr-4 text-slate-500 hover:text-slate-800">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </button>
                <h2 class="text-xl font-bold">Chat</h2>
             `;
             header.querySelector('#back-to-chats').onclick = () => {
                 currentView = 'chat';
                 renderAppContent();
             };

             mainContentElement.appendChild(header);
             mainContentElement.appendChild(chatPanel);
             break;

        case 'profile':
            mainContentElement.innerHTML = `
                <div class="max-w-md mx-auto p-8 bg-white rounded-3xl shadow-sm border border-slate-100 mt-8">
                    <div class="flex flex-col items-center mb-8">
                        <div class="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center text-4xl mb-4">👤</div>
                        <h2 class="text-2xl font-bold text-slate-900">${currentUserData.name}</h2>
                        <p class="text-slate-500">${currentUserData.email}</p>
                    </div>

                    <div class="space-y-4">
                         <button id="join-class-btn-profile" class="w-full bg-blue-50 text-blue-700 font-bold py-3 px-4 rounded-xl hover:bg-blue-100 transition-colors text-left flex items-center">
                            <span class="mr-3">🏫</span> Připojit se k třídě
                        </button>
                        <button id="student-logout-btn-profile" class="w-full bg-red-50 text-red-700 font-bold py-3 px-4 rounded-xl hover:bg-red-100 transition-colors text-left flex items-center">
                            <span class="mr-3">🚪</span> Odhlásit se
                        </button>
                    </div>
                </div>
            `;
            document.getElementById('student-logout-btn-profile').addEventListener('click', handleLogout);
            document.getElementById('join-class-btn-profile').addEventListener('click', handleJoinClass);
            break;
            
        case 'lessonDetail':
            mainContentElement.innerHTML = '';
            const detailEl = document.createElement('student-lesson-detail');
            detailEl.lessonId = selectedLessonId;
            detailEl.currentUserData = currentUserData;
            // Detail view handles its own padding/layout usually, but let's ensure it fills
            detailEl.className = "block min-h-full";
            mainContentElement.appendChild(detailEl);
            break;
            
        case 'loading':
        default:
            mainContentElement.innerHTML = '<p class="text-center text-slate-500 p-8">Načítání...</p>';
            break;
    }
}

function openChatForLesson(lessonId) {
    selectedLessonId = lessonId;
    currentView = 'chat-detail';
    renderAppContent();
}

// Funkcia pre zadanie mena (zostáva ako innerHTML pre jednoduchosť)
function promptForStudentName(userId) {
    const container = mainContentElement || document.getElementById('app-container');
    
    container.innerHTML = `
        <div class="flex items-center justify-center min-h-full p-4">
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

async function handleJoinClass() {
    const joinCode = window.prompt("Zadejte kód pro připojení do třídy:");
    if (!joinCode || joinCode.trim() === "") {
        return; // User cancelled or entered empty code
    }

    showToast("Připojuji se k třídě...", false);

    try {
        const joinClass = httpsCallable(firebaseInit.functions, 'joinClass');
        const result = await joinClass({ joinCode: joinCode.trim() });

        if (result.data.success) {
            showToast(`Úspěšně jste se připojil(a) k třídě ${result.data.groupName}!`);

        } else {
            showToast("Neznámá chyba při připojování.", true);
        }
    } catch (error) {
        console.error("Error joining class:", error);
        showToast(error.message || "Nepodařilo se připojit k třídě.", true);
    }
}
