import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, auth } from './firebase-init.js';

// Importy funkcií z ostatných modulov
import { renderOverviewScreen, promptForStudentName } from './views/student/dashboard-view.js';
import { renderTelegramPage } from './views/student/telegram-view.js';

// Globálne premenné pre správu stavu
let currentUserData = null;
let studentDataUnsubscribe = null;
let currentLessonId = null;

// Hlavná funkcia, ktorá riadi študentský panel
export function initStudentDashboard() {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    const user = auth.currentUser;
    if (!user) {
        console.error("initStudentDashboard: Používateľ nie je prihlásený.");
        roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Chyba: Uživatel není přihlášen.</div>`;
        return;
    }
    
    const isNewUser = user.metadata.creationTime === user.metadata.lastSignInTime;
    let initialCheckDone = false; 

    if (studentDataUnsubscribe) {
        studentDataUnsubscribe();
    }

    try {
        const userDocRef = doc(db, "students", user.uid);
        
        studentDataUnsubscribe = onSnapshot(userDocRef, async (userDoc) => {
            if (userDoc.exists()) {
                const previousUserData = currentUserData;
                currentUserData = { id: userDoc.id, ...userDoc.data() };

                if (!currentUserData.name) {
                    promptForStudentName(user.uid);
                    return;
                }
                
                const isLessonView = !!document.getElementById('lesson-content-display');
                
                if (!isLessonView || !previousUserData) {
                    renderOverviewScreen();
                } else {
                    const activeTab = document.querySelector('.lesson-menu-item.border-green-700');
                    if (activeTab && activeTab.dataset.view === 'telegram') {
                         const contentDisplay = document.getElementById('lesson-content-display');
                         renderTelegramPage(contentDisplay, currentUserData);
                    }
                }
            } else {
                if (isNewUser && !initialCheckDone) {
                    roleContentWrapper.innerHTML = `<div class="flex items-center justify-center h-screen"><div class="text-center p-8 bg-white rounded-2xl shadow-lg"><div class="text-xl font-semibold text-slate-700">Vytváříme váš profil, chvilku strpení...</div><div class="loader mt-4"></div></div></div>`;
                } else {
                    roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Nepodařilo se najít váš studentský profil.</div>`;
                }
                initialCheckDone = true;
            }
        }, (error) => {
            console.error("Firestore snapshot listener error:", error);
        });
    } catch (error) {
        console.error("Error initializing student dashboard listener:", error);
    }
}

// Funkcia na zdieľanie dát o používateľovi s ostatnými modulmi
export function getCurrentUserData() {
    return currentUserData;
}

export function setCurrentLessonId(lessonId) {
    currentLessonId = lessonId;
}
