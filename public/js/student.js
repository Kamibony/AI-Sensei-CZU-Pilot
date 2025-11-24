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
import './student/chat-panel.js'; // Ensure this path is correct based on list_files
import './views/student/student-dashboard-view.js';

// Globálny stav pre študentskú sekciu
let studentDataUnsubscribe = null;
let currentUserData = null;
let currentView = 'loading'; // 'loading', 'promptForName', 'home', 'courses', 'chat', 'profile', 'lessonDetail'
let selectedLessonId = null;

let mainContentElement = null; // Odkaz na hlavný kontajner
let roleContentWrapper = null;
let mainNav = null;
let mobileBottomNav = null;

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
                // Initial state logic
                if (currentView === 'loading' || currentView === 'promptForName') {
                    currentView = 'home';
                }
            }
            
            // Render basic layout if needed
            renderStudentLayout();
            
            // Update Navigation UI state
            updateNavigationState();

            // Render current view
            renderAppContent();

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

    // Cleanup DOM references
    mainContentElement = null;
    roleContentWrapper = null;
    mainNav = null;
    mobileBottomNav = null;

    currentView = 'loading';
    selectedLessonId = null;
}

function renderStudentLayout() {
    // Only render if we haven't already set up the layout
    if (document.getElementById('student-layout-initialized')) return;

    // Use existing template elements from index.html
    roleContentWrapper = document.getElementById('role-content-wrapper');
    mainNav = document.getElementById('main-nav');
    mobileBottomNav = document.getElementById('mobile-bottom-nav');

    if (!roleContentWrapper || !mainNav || !mobileBottomNav) {
        console.error("Missing critical layout elements in index.html");
        return;
    }
    
    // Mark as initialized to prevent re-rendering layout on every snapshot update
    roleContentWrapper.setAttribute('id', 'role-content-wrapper'); // Keep ID
    const flag = document.createElement('div');
    flag.id = 'student-layout-initialized';
    flag.style.display = 'none';
    document.body.appendChild(flag);

    // 1. Render Desktop Navigation (Side Bar)
    renderDesktopNavigation();

    // 2. Render Mobile Bottom Navigation
    renderMobileNavigation();
    
    // Global Event Listeners for Navigation
    document.addEventListener('lesson-selected', (e) => {
        selectedLessonId = e.detail.lessonId;
        currentView = 'lessonDetail';
        renderAppContent();
        // We don't update nav state here as 'lessonDetail' isn't a top-level nav item,
        // or we could map it to 'courses'.
    });

    document.addEventListener('back-to-list', (e) => {
        selectedLessonId = null;
        currentView = 'courses';
        renderAppContent();
        updateNavigationState();
    });
}

function renderDesktopNavigation() {
    mainNav.innerHTML = `
        <div class="flex flex-col items-center w-full h-full pt-6">
             <div class="mb-8 p-2 rounded-xl bg-green-900/50">
                <span class="text-2xl">🎓</span>
            </div>

            <div class="flex flex-col w-full space-y-2 px-2">
                ${renderDesktopNavItem('home', 'Domů', '🏠')}
                ${renderDesktopNavItem('courses', 'Knihovna', '📚')}
                ${renderDesktopNavItem('chat', 'Chat', '💬')}
                ${renderDesktopNavItem('profile', 'Profil', '👤')}
            </div>

             <div class="mt-auto pb-6 w-full px-2">
                <button id="desktop-logout-btn" class="flex items-center w-full p-3 rounded-xl text-green-100 hover:bg-green-700 transition-colors">
                    <span class="mr-3 text-xl">🚪</span>
                    <span class="font-medium hidden lg:inline">Odhlásit</span>
                </button>
            </div>
        </div>
    `;

    // Add click listeners
    ['home', 'courses', 'chat', 'profile'].forEach(view => {
        document.getElementById(`nav-desktop-${view}`).addEventListener('click', () => {
            currentView = view;
            renderAppContent();
            updateNavigationState();
        });
    });

    document.getElementById('desktop-logout-btn').addEventListener('click', handleLogout);
}

function renderDesktopNavItem(viewName, label, icon) {
    return `
        <button id="nav-desktop-${viewName}" class="nav-item flex items-center w-full p-3 rounded-xl text-green-100 hover:bg-green-700 transition-all duration-200 group">
            <span class="mr-3 text-xl group-hover:scale-110 transition-transform">${icon}</span>
            <span class="font-medium hidden lg:inline">${label}</span>
        </button>
    `;
}

function renderMobileNavigation() {
    // Style: Fixed bottom, bg-white/90, backdrop-blur, border-t, pb-safe
    mobileBottomNav.className = "md:hidden fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe z-50 flex justify-around items-center px-2 py-2 safe-area-pb";

    mobileBottomNav.innerHTML = `
        ${renderMobileNavItem('home', 'Domů', '🏠')}
        ${renderMobileNavItem('courses', 'Kurzy', '📚')}
        ${renderMobileNavItem('chat', 'Chat', '💬')}
        ${renderMobileNavItem('profile', 'Profil', '👤')}
    `;

    // Add click listeners
    ['home', 'courses', 'chat', 'profile'].forEach(view => {
        document.getElementById(`nav-mobile-${view}`).addEventListener('click', () => {
            currentView = view;
            renderAppContent();
            updateNavigationState();
        });
    });
}

function renderMobileNavItem(viewName, label, icon) {
    return `
        <button id="nav-mobile-${viewName}" class="nav-item flex flex-col items-center justify-center w-full py-1 text-slate-400 hover:text-slate-600 transition-colors">
            <span class="text-2xl mb-0.5 transform transition-transform duration-200 nav-icon">${icon}</span>
            <span class="text-[10px] font-medium tracking-wide nav-label">${label}</span>
        </button>
    `;
}

function updateNavigationState() {
    // Determine active tab (map lessonDetail to courses if desired, or keep separate)
    let activeTab = currentView;
    if (activeTab === 'lessonDetail') activeTab = 'courses';
    if (activeTab === 'promptForName' || activeTab === 'loading') activeTab = 'home';

    // Desktop
    document.querySelectorAll('#main-nav .nav-item').forEach(el => {
        el.classList.remove('bg-green-700', 'text-white', 'shadow-lg');
        el.classList.add('text-green-100');
    });
    const activeDesktop = document.getElementById(`nav-desktop-${activeTab}`);
    if (activeDesktop) {
        activeDesktop.classList.add('bg-green-700', 'text-white', 'shadow-lg');
        activeDesktop.classList.remove('text-green-100');
    }

    // Mobile
    document.querySelectorAll('#mobile-bottom-nav .nav-item').forEach(el => {
        el.classList.remove('text-green-600');
        el.classList.add('text-slate-400');

        const icon = el.querySelector('.nav-icon');
        if (icon) icon.classList.remove('scale-110');
    });

    const activeMobile = document.getElementById(`nav-mobile-${activeTab}`);
    if (activeMobile) {
        activeMobile.classList.remove('text-slate-400');
        activeMobile.classList.add('text-green-600');

        const icon = activeMobile.querySelector('.nav-icon');
        if (icon) icon.classList.add('scale-110');
    }
}

function renderAppContent() {
    const container = document.getElementById('role-content-wrapper');
    if (!container) return;

    // Ensure padding for bottom nav on mobile
    container.className = "flex-grow flex flex-col overflow-y-auto bg-slate-50 pb-24 md:pb-0";

    switch (currentView) {
        case 'promptForName':
            container.innerHTML = '';
            promptForStudentName(currentUserData.id, container);
            break;

        case 'home':
            container.innerHTML = '<student-dashboard-view></student-dashboard-view>';
            break;
            
        case 'courses':
            container.innerHTML = '<student-lesson-list></student-lesson-list>';
            break;

        case 'chat':
            container.innerHTML = '<student-chat-panel></student-chat-panel>';
            break;

        case 'profile':
            renderProfilePlaceholder(container);
            break;
            
        case 'lessonDetail':
            container.innerHTML = '';
            const detailEl = document.createElement('student-lesson-detail');
            detailEl.lessonId = selectedLessonId;
            detailEl.currentUserData = currentUserData;
            container.appendChild(detailEl);
            break;
            
        case 'loading':
        default:
            container.innerHTML = `
                <div class="flex justify-center items-center h-full">
                     <div class="spinner w-12 h-12 border-4 border-slate-200 border-t-green-600 rounded-full animate-spin"></div>
                </div>`;
            break;
    }
}

function renderProfilePlaceholder(container) {
    container.innerHTML = `
        <div class="max-w-md mx-auto mt-10 p-6 bg-white rounded-3xl shadow-sm text-center">
            <div class="w-24 h-24 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-4 text-4xl">
                👤
            </div>
            <h2 class="text-2xl font-bold text-slate-800">${currentUserData?.name || 'Student'}</h2>
            <p class="text-slate-500 mb-6">${currentUserData?.email}</p>

            <button id="profile-join-class" class="w-full mb-3 bg-indigo-600 text-white font-bold py-3 px-4 rounded-xl shadow-lg hover:shadow-xl hover:bg-indigo-700 transition-all">
                Připojit se k třídě
            </button>

            <button id="profile-logout-btn" class="w-full bg-red-50 text-red-600 font-bold py-3 px-4 rounded-xl hover:bg-red-100 transition-all">
                Odhlásit se
            </button>
        </div>
    `;
    
    document.getElementById('profile-logout-btn').addEventListener('click', handleLogout);
    document.getElementById('profile-join-class').addEventListener('click', handleJoinClass);
}

// Funkcia pre zadanie mena
function promptForStudentName(userId, container) {
    container.innerHTML = `
        <div class="flex items-center justify-center min-h-full p-4">
            <div class="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md text-center">
                <h1 class="text-2xl font-bold text-slate-800 mb-4">Vítejte v AI Sensei!</h1>
                <p class="text-slate-600 mb-6">Prosím, zadejte své jméno, abychom věděli, jak vás oslovovat.</p>
                <input type="text" id="student-name-input" placeholder="Vaše jméno a příjmení" class="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4">
                <button id="save-name-btn" class="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-3 px-4 rounded-xl hover:from-indigo-700 hover:to-purple-700 shadow-lg transition-all">Uložit a pokračovat</button>
            </div>
        </div>`;

    document.getElementById('save-name-btn').addEventListener('click', async () => {
        const name = document.getElementById('student-name-input').value.trim();
        if (!name) return showToast('Jméno nemůže být prázdné.', true);

        try {
            await updateDoc(doc(firebaseInit.db, 'students', userId), { name: name });
            showToast('Jméno úspěšně uloženo!');
            // onSnapshot sa postará o prekreslenie
        } catch (error) {
            showToast('Nepodařilo se uložit jméno.', true);
        }
    });
}

async function handleJoinClass() {
    const joinCode = window.prompt("Zadejte kód pro připojení do třídy:");
    if (!joinCode || joinCode.trim() === "") {
        return;
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
