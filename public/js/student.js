import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, auth } from './firebase-init.js';

// Importy funkcií, ktoré boli presunuté do svojich vlastných modulov
import { renderOverviewScreen, promptForStudentName } from './views/student/dashboard-view.js';
import { renderTelegramPage } from './views/student/telegram-view.js';

// Globálne premenné pre hlavný controller
let currentUserData = null;
let studentDataUnsubscribe = null;

// Hlavná a jediná exportovaná funkcia, ktorá riadi celý študentský panel
export function initStudentDashboard() {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    const user = auth.currentUser;
    if (!user) {
        console.error("initStudentDashboard: Používateľ nie je prihlásený. Listener sa nespustí.");
        roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Chyba: Uživatel není přihlášen.</div>`;
        return;
    }

    // --- OPRAVA: Rozpoznanie nového používateľa a čakanie na vytvorenie profilu ---
    const isNewUser = user.metadata.creationTime === user.metadata.lastSignInTime;
    let initialCheckDone = false; 

    if (studentDataUnsubscribe) {
        studentDataUnsubscribe();
    }

    try {
        const userDocRef = doc(db, "students", user.uid);
        
        studentDataUnsubscribe = onSnapshot(userDocRef, async (userDoc) => {
            if (userDoc.exists()) {
                // Profil bol úspešne nájdený.
                const previousUserData = currentUserData;
                currentUserData = { id: userDoc.id, ...userDoc.data() };

                // Ak používateľ nemá zadané meno, vyžiadame si ho.
                if (!currentUserData.name) {
                    promptForStudentName(user.uid);
                    return;
                }
                
                const isLessonView = !!document.getElementById('lesson-content-display');
                
                // Zobrazíme hlavný prehľad, ak nie sme v detaile lekcie alebo je to prvé načítanie.
                if (!isLessonView || !previousUserData) {
                    renderOverviewScreen();
                } else {
                    // Ak sme už v detaile lekcie, môžeme potrebovať aktualizovať niektoré časti (napr. Telegram).
                    const activeTab = document.querySelector('.lesson-menu-item.border-green-700');
                    if (activeTab && activeTab.dataset.view === 'telegram') {
                         const contentDisplay = document.getElementById('lesson-content-display');
                         renderTelegramPage(contentDisplay, currentUserData);
                    }
                }
            } else {
                // Profil nebol nájdený - aplikujeme inteligentnú logiku.
                if (isNewUser && !initialCheckDone) {
                    // Ak je to nový používateľ, zobrazíme čakaciu správu a počkáme.
                    roleContentWrapper.innerHTML = `<div class="flex items-center justify-center h-screen"><div class="text-center p-8 bg-white rounded-2xl shadow-lg"><div class="text-xl font-semibold text-slate-700">Vytváříme váš profil, chvilku strpení...</div><div class="loader mt-4"></div></div></div>`;
                } else {
                    // Ak to nie je nový používateľ, potom je to skutočná chyba.
                    roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Nepodařilo se najít váš studentský profil. Kontaktujte prosím podporu.</div>`;
                }
                initialCheckDone = true;
            }
        }, (error) => {
            console.error("Firestore snapshot listener error:", error);
            if (error.code === 'permission-denied') {
                roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Chyba oprávnění. Ujistěte se, že jste správně přihlášeni.</div>`;
            }
        });
    } catch (error) {
        console.error("Error initializing student dashboard listener:", error);
        roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Vyskytla se kritická chyba při načítání vašeho profilu.</div>`;
    }
}

// Pomocná funkcia, ktorá umožňuje ostatným modulom získať prístup k dátam študenta
export function getCurrentUserData() {
    return currentUserData;
}
