// Súbor: public/js/student.js
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
import './student/student-classes-view.js';

// Globálny stav pre študentskú sekciu
let studentDataUnsubscribe = null;
let currentUserData = null;
let currentView = 'loading'; 
let selectedLessonId = null;
let previousView = 'home';

let roleContentWrapper = null;
let mainNav = null;
let mobileBottomNav = null;

export async function initStudentApp() {
    const user = firebaseInit.auth.currentUser;
    if (!user) {
        console.error("Kritická chyba: initStudentApp bol spustený bez prihláseného používateľa!");
        return;
    }

    await translationService.init();

    translationService.subscribe(() => {
        renderStudentLayout();
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
                if (currentView === 'loading' || currentView === 'promptForName') {
                    currentView = 'home';
                }
            }
            
            renderStudentLayout();
            renderAppContent();
            updateNavigationState();

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
    }
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }

    roleContentWrapper = null;
    mainNav = null;
    mobileBottomNav = null;
    currentView = 'loading';
    selectedLessonId = null;
}

function renderStudentLayout() {
    roleContentWrapper = document.getElementById('role-content-wrapper');
    mainNav = document.getElementById('main-nav');
    mobileBottomNav = document.getElementById('mobile-bottom-nav');

    if (!roleContentWrapper || !mainNav || !mobileBottomNav) return;
    
    // 1. SYSTEM LAYOUT FIX (Flexbox)
    // Sidebar: w-64, not fixed (flex item), visible on md+
    // Content: flex-1, fills remaining space
    // NOTE: If mainNav is hidden (mobile), it takes 0 width. If flex (desktop), it takes 64.
    mainNav.className = 'hidden md:flex w-64 h-full flex-col bg-white border-r border-slate-100 z-40 transition-all duration-300 flex-shrink-0';

    // On desktop, mainNav is in the flow, so we don't need pl-64 if the parent is flex-row.
    // However, if the mainNav is FIXED (which is common for sidebars), we need pl-64.
    // The prompt requested: "sidebar w-64, obsah flex-1 ... aby sa obsah nezobrazoval pod menu ale vedľa neho".
    // If the sidebar is flex, it sits next to it.
    // I am adding `flex-shrink-0` to mainNav to be safe.

    roleContentWrapper.className = 'flex-1 h-full flex flex-col overflow-y-auto bg-slate-50 transition-all duration-300 pb-20 md:pb-0';

    // Global Listeners (Attach ONCE)
    if (!document.getElementById('student-layout-initialized')) {
        const flag = document.createElement('div');
        flag.id = 'student-layout-initialized';
        flag.style.display = 'none';
        document.body.appendChild(flag);

        document.addEventListener('lesson-selected', (e) => {
            selectedLessonId = e.detail.lessonId;
            previousView = currentView === 'lessonDetail' ? previousView : currentView;
            currentView = 'lessonDetail';
            renderAppContent();
        });

        document.addEventListener('back-to-list', () => {
            selectedLessonId = null;
            currentView = 'lessons'; // Changed from 'courses' to 'lessons' to match new key
            renderAppContent();
            updateNavigationState();
        });

        // Listen for requests to join class from anywhere
        document.addEventListener('request-join-class', () => {
            handleJoinClass();
        });
    }

    renderDesktopNavigation();
    renderMobileNavigation();
}

function renderDesktopNavigation() {
    mainNav.innerHTML = `
        <div id="nav-logo" class="h-20 flex items-center justify-start px-6 cursor-pointer group flex-shrink-0 border-b border-transparent">
             <div class="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-md shadow-indigo-200 font-bold text-lg flex-shrink-0 group-hover:scale-105 transition-transform">
                A
            </div>
            <span class="ml-3 font-bold text-slate-800 text-lg tracking-tight group-hover:text-indigo-600 transition-colors">
                AI Sensei
            </span>
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar flex flex-col w-full px-3 py-6 space-y-1">
            ${renderDesktopNavItem('home', translationService.t('nav.dashboard'), '🏠')}
            ${renderDesktopNavItem('lessons', 'Moje Lekce', '📖')}
            ${renderDesktopNavItem('classes', 'Moje Třídy', '🏫')}
            ${renderDesktopNavItem('agenda', 'Agenda', '📅')}
        </div>

        <div class="p-4 border-t border-slate-100 bg-white">
             <button id="desktop-logout-btn" class="nav-item w-full flex items-center p-2.5 rounded-xl transition-all duration-200 text-slate-400 hover:bg-red-50 hover:text-red-600 group outline-none focus:outline-none">
                <span class="text-xl mr-3 group-hover:translate-x-1 transition-transform">🚪</span>
                <span class="text-sm font-medium">${translationService.t('nav.logout')}</span>
            </button>
        </div>
    `;

    // Click Listeners
    ['home', 'lessons', 'classes', 'agenda'].forEach(view => {
        const btn = document.getElementById(`nav-desktop-${view}`);
        if(btn) btn.addEventListener('click', () => {
            currentView = view;
            renderAppContent();
            updateNavigationState();
        });
    });

    document.getElementById('desktop-logout-btn').addEventListener('click', handleLogout);
    const logo = mainNav.querySelector('#nav-logo');
    if (logo) logo.addEventListener('click', () => {
         currentView = 'home';
         renderAppContent();
         updateNavigationState();
    });
}

function renderDesktopNavItem(viewName, label, icon) {
    // New Clean Style: No borders, consistent padding
    return `
        <button id="nav-desktop-${viewName}" class="nav-item w-full flex items-center p-2.5 rounded-xl transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group outline-none focus:outline-none relative overflow-hidden">
            <span class="text-xl mr-3 relative z-10 group-hover:scale-110 transition-transform duration-200">${icon}</span>
            <span class="text-sm font-medium relative z-10">${label}</span>
        </button>
    `;
}

function renderMobileNavigation() {
    mobileBottomNav.className = "md:hidden fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe z-50 flex justify-around items-center px-2 py-2 safe-area-pb";

    mobileBottomNav.innerHTML = `
        ${renderMobileNavItem('home', translationService.t('nav.dashboard'), '🏠')}
        ${renderMobileNavItem('lessons', 'Lekce', '📖')}
        ${renderMobileNavItem('classes', 'Třídy', '🏫')}
        ${renderMobileNavItem('agenda', 'Agenda', '📅')}
    `;

    ['home', 'lessons', 'classes', 'agenda'].forEach(view => {
        document.getElementById(`nav-mobile-${view}`).addEventListener('click', () => {
            currentView = view;
            renderAppContent();
            updateNavigationState();
        });
    });
}

function renderMobileNavItem(viewName, label, icon) {
    return `
        <button id="nav-mobile-${viewName}" class="nav-item flex flex-col items-center justify-center w-full py-2 text-slate-400 hover:text-slate-600 transition-colors outline-none">
            <span class="text-2xl mb-1 transform transition-transform duration-200 nav-icon">${icon}</span>
            <span class="text-[10px] font-medium tracking-wide nav-label">${label}</span>
        </button>
    `;
}

function updateNavigationState() {
    let activeTab = currentView;
    if (activeTab === 'lessonDetail') activeTab = 'lessons';
    if (activeTab === 'promptForName' || activeTab === 'loading') activeTab = 'home';

    // Desktop: Reset & Set Active
    document.querySelectorAll('#main-nav .nav-item').forEach(el => {
        el.className = 'nav-item w-full flex items-center p-2.5 rounded-xl transition-all duration-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 group outline-none focus:outline-none';
    });

    const activeDesktop = document.getElementById(`nav-desktop-${activeTab}`);
    if (activeDesktop) {
        // Active: Indigo Background + Text
        activeDesktop.className = 'nav-item w-full flex items-center p-2.5 rounded-xl transition-all duration-200 bg-indigo-50 text-indigo-700 font-bold shadow-sm group outline-none focus:outline-none';
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

    // Reset content to be sure
    container.innerHTML = '';

    switch (currentView) {
        case 'promptForName':
            promptForStudentName(currentUserData.id, container);
            break;

        case 'home':
            container.innerHTML = '<student-dashboard-view></student-dashboard-view>';
            break;
            
        case 'lessons':
            container.innerHTML = '<student-lesson-list></student-lesson-list>';
            break;

        case 'classes':
            container.innerHTML = '<student-classes-view></student-classes-view>';
            break;

        case 'agenda':
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-center p-8">
                    <div class="w-24 h-24 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center text-4xl mb-6">📅</div>
                    <h2 class="text-2xl font-bold text-slate-800">Agenda</h2>
                    <p class="text-slate-500 mt-2 max-w-md">Tuto sekci pro vás právě připravujeme. Brzy zde uvidíte svůj rozvrh a plánované události.</p>
                </div>
            `;
            break;
            
        case 'lessonDetail':
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

function promptForStudentName(userId, container) {
    container.innerHTML = `
        <div class="flex items-center justify-center h-full p-4">
            <div class="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md text-center">
                <div class="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-6 text-3xl">✨</div>
                <h1 class="text-2xl font-bold text-slate-800 mb-2">Vítejte v AI Sensei</h1>
                <p class="text-slate-500 mb-8">Jak vám máme říkat?</p>
                
                <input type="text" id="student-name-input" placeholder="Vaše jméno" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 mb-4 transition-all text-center font-bold text-lg text-slate-800">
                
                <button id="save-name-btn" class="w-full bg-indigo-600 text-white font-bold py-4 px-6 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all transform active:scale-95">
                    Pokračovat →
                </button>
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
    if (!joinCode || joinCode.trim() === "") return;

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
