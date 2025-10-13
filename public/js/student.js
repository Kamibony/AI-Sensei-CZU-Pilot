import { doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { showToast } from './utils.js';
import { db, auth, functions } from './firebase-init.js';
import { setupStudentNav } from './views/student/navigation.js';
import { fetchLessons, renderStudentDashboard } from './views/student/dashboard-view.js';
import { showStudentLesson } from './views/student/lesson-view.js';
import { renderTelegramPage } from './views/student/telegram-view.js';

let lessonsData = [];
let currentUserData = null;
let studentDataUnsubscribe = null;
let currentLessonId = null;

const sendMessageFromStudent = httpsCallable(functions, 'sendMessageFromStudent');
const submitQuizResults = httpsCallable(functions, 'submitQuizResults');
const submitTestResults = httpsCallable(functions, 'submitTestResults');

function getCurrentLessonId() {
    return currentLessonId;
}

function setCurrentLessonId(lessonId) {
    currentLessonId = lessonId;
}

async function renderOverviewScreen() {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    await setupStudentNav();
    const fetchedLessons = await fetchLessons();
    if (fetchedLessons) {
        lessonsData = fetchedLessons;
        roleContentWrapper.innerHTML = `<div id="student-content-area" class="flex-grow overflow-y-auto bg-slate-50 h-full"></div>`;
        const studentContentArea = document.getElementById('student-content-area');
        renderStudentDashboard(studentContentArea, lessonsData, (lesson) => {
            showStudentLesson(lesson, {
                renderOverviewScreen,
                currentUserData,
                db,
                auth,
                sendMessageFromStudent,
                submitQuizResults,
                submitTestResults,
                showToast,
                getCurrentLessonId,
                setCurrentLessonId
            });
        });
    }
}

function promptForStudentName(userId) {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;
    roleContentWrapper.innerHTML = `
        <div class="flex items-center justify-center h-screen bg-slate-50">
            <div class="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md text-center">
                <h1 class="text-2xl font-bold text-slate-800 mb-4">Vítejte v AI Sensei!</h1>
                <p class="text-slate-600 mb-6">Prosím, zadejte své jméno, abychom věděli, jak vás oslovovat.</p>
                <input type="text" id="student-name-input" placeholder="Vaše jméno a příjmení" class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                <button id="save-name-btn" class="w-full mt-4 bg-green-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-800 transition-colors">Uložit a pokračovat</button>
            </div>
        </div>
    `;
    document.getElementById('save-name-btn').addEventListener('click', async () => {
        const nameInput = document.getElementById('student-name-input');
        const name = nameInput.value.trim();
        if (!name) {
            showToast('Jméno nemůže být prázdné.', true);
            return;
        }
        try {
            const studentRef = doc(db, 'students', userId);
            await updateDoc(studentRef, { name: name });
            showToast('Jméno úspěšně uloženo!');
        } catch (error) {
            console.error("Error saving student name:", error);
            showToast('Nepodařilo se uložit jméno.', true);
        }
    });
}

export function initStudentDashboard() {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) return;

    const user = auth.currentUser;
    if (!user) {
        console.error("initStudentDashboard: Používateľ nie je prihlásený. Listener sa nespustí.");
        roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Chyba: Uživatel není přihlášen.</div>`;
        return;
    }

    if (studentDataUnsubscribe) studentDataUnsubscribe();

    try {
        const userDocRef = doc(db, "students", user.uid);
        
        studentDataUnsubscribe = onSnapshot(userDocRef, async (userDoc) => {
            if (userDoc.exists()) {
                const previousUserData = currentUserData;
                currentUserData = userDoc.data();

                if (!currentUserData.telegramChatId && !currentUserData.telegramConnectionToken) {
                    console.log("Generating missing Telegram token for user...");
                    const newToken = 'tg_' + Date.now() + Math.random().toString(36).substring(2, 8);
                    await updateDoc(userDocRef, { telegramConnectionToken: newToken });
                    currentUserData.telegramConnectionToken = newToken;
                    showToast('Byl pro vás vygenerován nový odkaz pro Telegram.');
                }

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
                roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Nepodařilo se najít váš studentský profil.</div>`;
            }
        }, (error) => {
            console.error("Firestore snapshot listener error:", error);
            if (error.code === 'permission-denied') {
                roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Chyba oprávnění. Ujistěte se, že jste správně přihlášeni a máte přístup k tomuto obsahu.</div>`;
            }
        });
    } catch (error) {
        console.error("Error initializing student dashboard listener:", error);
        roleContentWrapper.innerHTML = `<div class="p-8 text-center text-red-500">Vyskytla se kritická chyba při načítání vašeho profilu.</div>`;
    }
}