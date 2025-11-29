// Súbor: public/js/student.js
// Tento súbor je teraz "kontrolór" alebo "router" pre študentskú sekciu.

import { doc, onSnapshot, setDoc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
import { translationService } from './utils/translation-service.js';
import * as firebaseInit from './firebase-init.js';
import { handleLogout } from './auth.js';

// Importujeme App Shell
import './views/student/student-app.js';

let studentDataUnsubscribe = null;
let currentUserData = null;

export async function initStudentApp() {
    const user = firebaseInit.auth.currentUser;
    if (!user) {
        console.error("Kritická chyba: initStudentApp bol spustený bez prihláseného používateľa!");
        document.getElementById('app-container').innerHTML = `<p class="p-8 text-center text-red-600">Nastala kritická chyba pri prihlasovaní. Skúste obnoviť stránku.</p>`;
        return;
    }

    // Init translation
    await translationService.init();

    if (studentDataUnsubscribe) studentDataUnsubscribe();

    const userDocRef = doc(firebaseInit.db, "students", user.uid);
    
    studentDataUnsubscribe = onSnapshot(userDocRef, async (docSnapshot) => {
        if (docSnapshot.exists()) {
            currentUserData = { id: docSnapshot.id, ...docSnapshot.data() };
            
            const container = document.getElementById('role-content-wrapper');
            const mainNav = document.getElementById('main-nav');
            const mobileBottomNav = document.getElementById('mobile-bottom-nav');

            // Hide legacy navigation
            if (mainNav) mainNav.style.display = 'none';
            if (mobileBottomNav) mobileBottomNav.style.display = 'none';

            // Adjust container styling for the new shell
            if (container) {
                container.className = "h-full w-full"; // Reset specific paddings/margins
            }

            if (!currentUserData.name || currentUserData.name.trim() === '') {
                // Show name prompt
                if (container) {
                    container.innerHTML = ''; // Clear
                    promptForStudentName(user.uid, container);
                }
            } else {
                // Render App Shell
                if (container && !container.querySelector('student-app')) {
                    container.innerHTML = '<student-app></student-app>';
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
}

// Funkcia pre zadanie mena
function promptForStudentName(userId, container) {
    container.innerHTML = `
        <div class="flex items-center justify-center min-h-full p-4 bg-slate-50">
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
