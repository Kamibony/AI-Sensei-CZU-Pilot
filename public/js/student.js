// Súbor: public/js/student.js
// Tento súbor je teraz "kontrolór" alebo "router" pre študentskú sekciu.

import { doc, onSnapshot, setDoc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { showToast } from './utils.js';
import { translationService } from './utils/translation-service.js';
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
let roleContentWrapper = null;
let mainNav = null;
let mobileBottomNav = null;

// --- JEDINÁ ZMENA: PREMENOVANIE FUNKCIE ---
export async function initStudentApp() {
// -----------------------------------------
    const user = firebaseInit.auth.currentUser;
    if (!user) {
        console.error("Kritická chyba: initStudentApp bol spustený bez prihláseného používateľa!");
        document.getElementById('app-container').innerHTML = `<p class="p-8 text-center text-red-600">Nastala kritická chyba pri prihlasovaní. Skúste obnoviť stránku.</p>`;
        return;
    }

    // Init translation
    await translationService.init();

    // Subscribe to language changes to re-render nav
    translationService.subscribe(() => {
        renderStudentLayout(); // Re-render navs
        // Re-render content if needed
        renderAppContent();
    });

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

    // Check if flag exists to avoid re-attaching global listeners multiple times
    if (!document.getElementById('student-layout-initialized')) {
        const flag = document.createElement('div');
        flag.id = 'student-layout-initialized';
        flag.style.display = 'none';
        document.body.appendChild(flag);

         // Global Event Listeners for Navigation (Attach ONLY ONCE)
        document.addEventListener('lesson-selected', (e) => {
            selectedLessonId = e.detail.lessonId;
            previousView = currentView === 'lessonDetail' ? previousView : currentView;
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

    // Always re-render navigation DOM to update translations
    // 1. Render Desktop Navigation (Side Bar)
    renderDesktopNavigation();

    // 2. Render Mobile Bottom Navigation
    renderMobileNavigation();
}

function renderDesktopNavigation() {
    // Apply Professor styling: bg-white/90, backdrop-blur-xl, border-r
    mainNav.className = 'hidden md:flex fixed top-0 left-0 h-full w-64 bg-white/90 backdrop-blur-xl border-r border-slate-100 z-50 flex-col justify-between transition-all duration-300';

    mainNav.innerHTML = `
        <!-- Top Section: Logo & Menu -->
        <div class="flex flex-col w-full">
            <!-- Logo -->
            <div id="nav-logo" class="h-20 flex items-center justify-start px-6 cursor-pointer group">
                 <div class="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-md shadow-indigo-200 font-bold text-lg flex-shrink-0 group-hover:scale-105 transition-transform">
                    A
                </div>
                <span class="ml-3 font-bold text-slate-800 text-lg tracking-tight group-hover:text-indigo-600 transition-colors">
                    AI Sensei
                </span>
            </div>

            <div class="mt-4 space-y-1 px-3">
                ${renderDesktopNavItem('home', translationService.t('nav.dashboard'), '🏠')}
                ${renderDesktopNavItem('courses', translationService.t('nav.classes'), '📚')}
                ${renderDesktopNavItem('chat', translationService.t('nav.interactions'), '💬')}
                ${renderDesktopNavItem('profile', translationService.t('student.join'), '👤')}
            </div>
        </div>

        <!-- Bottom Section: Logout -->
        <div class="p-4 border-t border-slate-100 space-y-1">
             <button id="desktop-logout-btn" class="w-full flex items-center p-2 rounded-lg transition-all duration-200 text-slate-400 hover:bg-red-50 hover:text-red-600 group">
                <div class="w-10 h-10 flex items-center justify-center rounded-md flex-shrink-0">
                    <span class="text-xl group-hover:translate-x-1 transition-transform">🚪</span>
                </div>
                <span class="ml-2 text-sm font-medium">${translationService.t('nav.logout')}</span>
            </button>
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

    // Logo Click to Dashboard
    const logo = mainNav.querySelector('#nav-logo');
    if (logo) {
        logo.addEventListener('click', () => {
             currentView = 'home';
             renderAppContent();
             updateNavigationState();
        });
    }
}

function renderDesktopNavItem(viewName, label, icon) {
    // Style: nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group border-l-4 border-transparent
    return `
        <button id="nav-desktop-${viewName}" class="nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group border-l-4 border-transparent">
            <div class="w-10 h-10 flex items-center justify-center rounded-md flex-shrink-0">
                <span class="text-xl transition-transform group-hover:scale-110">${icon}</span>
            </div>
            <span class="ml-2 text-sm font-medium">${label}</span>
        </button>
    `;
}

function renderMobileNavigation() {
    // Style: fixed bottom-0 w-full bg-white/95 backdrop-blur border-t border-slate-200 flex justify-around p-3 z-50
    mobileBottomNav.className = "md:hidden fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe z-50 flex justify-around items-center px-2 py-2 safe-area-pb";

    mobileBottomNav.innerHTML = `
        ${renderMobileNavItem('home', translationService.t('nav.dashboard'), '🏠')}
        ${renderMobileNavItem('courses', translationService.t('nav.classes'), '📚')}
        ${renderMobileNavItem('chat', translationService.t('nav.interactions'), '💬')}
        ${renderMobileNavItem('profile', translationService.t('student.join'), '👤')}
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
        <button id="nav-mobile-${viewName}" class="nav-item flex flex-col items-center justify-center w-full py-2 text-slate-400 hover:text-slate-600 transition-colors">
            <span class="text-2xl mb-1 transform transition-transform duration-200 nav-icon">${icon}</span>
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
        // Reset classes
        el.className = 'nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group border-l-4 border-transparent';
    });

    const activeDesktop = document.getElementById(`nav-desktop-${activeTab}`);
    if (activeDesktop) {
        // Active Style: bg-slate-50 text-indigo-600 font-semibold group border-l-4 border-indigo-500 shadow-sm
        activeDesktop.className = 'nav-item w-full flex items-center p-2 rounded-lg transition-all duration-200 bg-slate-50 text-indigo-600 font-semibold group border-l-4 border-indigo-500 shadow-sm';
    }

    // Mobile
    document.querySelectorAll('#mobile-bottom-nav .nav-item').forEach(el => {
        el.classList.remove('text-indigo-600');
        el.classList.add('text-slate-400');

        const icon = el.querySelector('.nav-icon');
        if (icon) icon.classList.remove('scale-110');
    });

    const activeMobile = document.getElementById(`nav-mobile-${activeTab}`);
    if (activeMobile) {
        activeMobile.classList.remove('text-slate-400');
        activeMobile.classList.add('text-indigo-600');

        const icon = activeMobile.querySelector('.nav-icon');
        if (icon) icon.classList.add('scale-110');
    }
}

function renderAppContent() {
    const container = document.getElementById('role-content-wrapper');
    if (!container) return;

    // Added md:pl-64 to account for fixed sidebar
    container.className = "flex-grow flex flex-col overflow-y-auto bg-slate-50 pb-24 md:pb-0 md:pl-64 transition-all duration-300";

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
                     <div class="spinner w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
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
                ${translationService.t('student.join')}
            </button>

            <button id="profile-logout-btn" class="w-full bg-red-50 text-red-600 font-bold py-3 px-4 rounded-xl hover:bg-red-100 transition-all">
                ${translationService.t('nav.logout')}
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
                <h1 class="text-2xl font-bold text-slate-800 mb-4">AI Sensei</h1>
                <p class="text-slate-600 mb-6">${translationService.t('student_dashboard.profile_create_desc')}</p>
                <input type="text" id="student-name-input" placeholder="${translationService.t('student_dashboard.name_placeholder')}" class="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4">
                <button id="save-name-btn" class="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold py-3 px-4 rounded-xl hover:from-indigo-700 hover:to-purple-700 shadow-lg transition-all">${translationService.t('student_dashboard.save_continue')}</button>
            </div>
        </div>`;

    document.getElementById('save-name-btn').addEventListener('click', async () => {
        const name = document.getElementById('student-name-input').value.trim();
        if (!name) return showToast(translationService.t('student_dashboard.name_required'), true);

        try {
            await updateDoc(doc(firebaseInit.db, 'students', userId), { name: name });
            showToast(translationService.t('student_dashboard.name_saved'));
        } catch (error) {
            showToast(translationService.t('student_dashboard.name_save_error'), true);
        }
    });
}

async function handleJoinClass() {
    const joinCode = window.prompt(translationService.t('student_dashboard.join_prompt'));
    if (!joinCode || joinCode.trim() === "") {
        return;
    }

    showToast(translationService.t('student_dashboard.joining'), false);

    try {
        const joinClass = httpsCallable(firebaseInit.functions, 'joinClass');
        const result = await joinClass({ joinCode: joinCode.trim() });

        if (result.data.success) {
            showToast(translationService.t('student_dashboard.join_success_group').replace('{groupName}', result.data.groupName));

        } else {
            showToast(translationService.t('student_dashboard.join_error_unknown'), true);
        }
    } catch (error) {
        console.error("Error joining class:", error);
        showToast(error.message || translationService.t('student_dashboard.join_error_unknown'), true);
    }
}
