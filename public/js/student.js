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

// Globálny stav pre študentskú sekciu
let studentDataUnsubscribe = null;
let currentUserData = null;
let currentView = 'loading'; // 'loading', 'promptForName', 'lessonList', 'lessonDetail'
let selectedLessonId = null;

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
                // Ak sme práve uložili meno, prepneme na zoznam
                if (currentView === 'promptForName') {
                    currentView = 'lessonList';
                }
                // Ak sme prišli prvýkrát, nastavíme zoznam
                if (currentView === 'loading') {
                    currentView = 'lessonList';
                }
            }
            
            // Renderujeme hlavný panel, ak ešte neexistuje
            if (!mainContentElement) {
                renderStudentPanel();
            }
            
            // Vždy prekreslíme obsah na základe aktuálneho stavu
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
    mainContentElement = null; // Zabudneme na element pri odhlásení
    currentView = 'loading';
    selectedLessonId = null;
}

// Táto funkcia renderuje IBA "obal" aplikácie (hlavičku)
function renderStudentPanel() {
    const appContainer = document.getElementById('app-container');
    appContainer.innerHTML = `
        <div class="flex flex-col h-screen">
            <header class="bg-white shadow-md p-3 md:p-4 flex justify-between items-center flex-shrink-0">
                <h1 class="text-lg md:text-xl font-bold text-green-800">AI Sensei - Student</h1>
                <div>
                    <span id="student-name-display" class="text-slate-700 text-sm mr-2 md:mr-4 hidden sm:inline"></span>
                    <button id="join-class-btn" class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-1.5 px-3 md:py-2 md:px-4 rounded-lg mr-2">Připojit se k třídě</button>
                    <button id="student-logout-btn" class="bg-red-600 hover:bg-red-700 text-white text-sm font-bold py-1.5 px-3 md:py-2 md:px-4 rounded-lg">Odhlásit se</button>
                </div>
            </header>
            <main id="student-main-content" class="flex-grow overflow-y-auto p-4 md:p-8 bg-slate-50"></main>
        </div>
    `;
    
    mainContentElement = document.getElementById('student-main-content');
    document.getElementById('student-logout-btn').addEventListener('click', handleLogout);
    document.getElementById('join-class-btn').addEventListener('click', handleJoinClass);
    
    // Pridáme listenery na vlastné udalosti z našich komponentov
    mainContentElement.addEventListener('lesson-selected', (e) => {
        selectedLessonId = e.detail.lessonId;
        currentView = 'lessonDetail';
        renderAppContent();
    });

    mainContentElement.addEventListener('back-to-list', (e) => {
        selectedLessonId = null;
        currentView = 'lessonList';
        renderAppContent();
    });
}

// Táto funkcia rozhoduje, ktorý komponent sa má zobraziť
function renderAppContent() {
    if (!mainContentElement || !currentUserData) return;

    // Aktualizujeme meno v hlavičke
    const nameDisplay = document.getElementById('student-name-display');
    if (nameDisplay) {
        nameDisplay.innerHTML = `Vítejte, <strong>${currentUserData.name || ''}</strong>!`;
    }

    switch (currentView) {
        case 'promptForName':
            mainContentElement.innerHTML = ''; // Vyčistíme
            promptForStudentName(currentUserData.id); // Táto funkcia priamo vkladá HTML
            break;
            
        case 'lessonList':
            mainContentElement.innerHTML = '<student-lesson-list></student-lesson-list>';
            break;
            
        case 'lessonDetail':
            mainContentElement.innerHTML = ''; // Najprv vyčistiť
            const detailEl = document.createElement('student-lesson-detail');
            detailEl.lessonId = selectedLessonId;
            detailEl.currentUserData = currentUserData;
            mainContentElement.appendChild(detailEl);
            break;
            
        case 'loading':
        default:
            mainContentElement.innerHTML = '<p class="text-center text-slate-500">Načítání...</p>';
            break;
    }
}

// Funkcia pre zadanie mena (zostáva ako innerHTML pre jednoduchosť)
function promptForStudentName(userId) {
    // Ak je mainContentElement (pohľad študenta), vložíme to doň.
    // Ak nie (napr. pri prvej registrácii), prepíšeme celý app-container.
    const container = mainContentElement || document.getElementById('app-container');
    
    container.innerHTML = `
        <div class="flex items-center justify-center min-h-full">
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
            // onSnapshot sa postará o prekreslenie
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

            // --- FIX: Force the lesson list to refresh ---
            const lessonListElement = document.querySelector('student-lesson-list');
            if (lessonListElement && typeof lessonListElement._fetchLessons === 'function') {
                lessonListElement._fetchLessons();
            }
            // ---------------------------------------------

        } else {
            // This case might not be reached if errors are thrown, but it's good practice
            showToast("Neznámá chyba při připojování.", true);
        }
    } catch (error) {
        console.error("Error joining class:", error);
        showToast(error.message || "Nepodařilo se připojit k třídě.", true);
    }
}
