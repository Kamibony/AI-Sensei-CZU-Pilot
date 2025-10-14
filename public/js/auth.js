import { 
    auth, 
    db 
} from './firebase-init.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    doc, 
    setDoc, 
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
import { initStudentDashboard } from './student.js';
import { initProfessorDashboard } from './professor.js';

let studentData = null;

// --- OPRAVA: Pridaný import initStudentDashboard ---
export function setupAuth(appContainer, loginTemplate, mainAppTemplate) {
    
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            if (user.isAnonymous) {
                appContainer.innerHTML = mainAppTemplate.innerHTML;
                initProfessorDashboard();
            } else {
                const studentProfile = await getStudentProfile(user.uid);
                if (studentProfile) {
                    studentData = { uid: user.uid, ...studentProfile };
                    appContainer.innerHTML = mainAppTemplate.innerHTML;
                    initStudentDashboard(studentData);
                } else {
                    promptForStudentName(user);
                }
            }
        } else {
            studentData = null;
            appContainer.innerHTML = loginTemplate.innerHTML;
            attachLoginListeners();
        }
    });
}

async function getStudentProfile(uid) {
    const docRef = doc(db, "students", uid);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
}

function promptForStudentName(user) {
    const appContainer = document.getElementById('app-container');
    appContainer.innerHTML = `
        <div class="flex items-center justify-center min-h-screen">
            <div class="w-full max-w-md mx-auto p-8">
                <div class="bg-white rounded-2xl shadow-lg p-8">
                    <h1 class="text-2xl font-bold text-center text-slate-800 mb-4">Vitajte!</h1>
                    <p class="text-center text-slate-600 mb-6">Zadajte svoje meno pre dokončenie registrácie.</p>
                    <input type="text" id="student-name-input" placeholder="Vaše meno a priezvisko" class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                    <button id="complete-profile-btn" class="w-full mt-4 bg-green-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-800 transition-colors">Dokončiť profil</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('complete-profile-btn').addEventListener('click', async () => {
        const name = document.getElementById('student-name-input').value.trim();
        if (name) {
            await createStudentProfile(user, name);
            // --- OPRAVA: Po vytvorení profilu sa načíta hlavný panel ---
            studentData = await getStudentProfile(user.uid);
            document.getElementById('app-container').innerHTML = document.getElementById('main-app-template').innerHTML;
            initStudentDashboard(studentData);
        } else {
            showToast('Meno je povinné.', true);
        }
    });
}


async function createStudentProfile(user, name) {
    const loadingScreen = document.getElementById('app-container');
    loadingScreen.innerHTML = `<div class="flex items-center justify-center min-h-screen"><div class="text-center"><p class="text-lg font-semibold text-slate-700">Vytvárame váš profil, chvíľku strpenia...</p></div></div>`;
    
    try {
        await setDoc(doc(db, "students", user.uid), {
            name: name,
            email: user.email,
            createdAt: serverTimestamp()
        });
        return true;
    } catch (error) {
        console.error("Error creating student profile: ", error);
        showToast("Nepodarilo sa vytvoriť profil.", true);
        return false;
    }
}


function attachLoginListeners() {
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const professorLoginBtn = document.getElementById('login-professor');

    const showRegisterForm = document.getElementById('show-register-form');
    const showLoginForm = document.getElementById('show-login-form');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    if (showRegisterForm) {
        showRegisterForm.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
        });
    }

    if (showLoginForm) {
        showLoginForm.addEventListener('click', (e) => {
            e.preventDefault();
            registerForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
        });
    }

    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            signInWithEmailAndPassword(auth, email, password)
                .catch(error => showToast(`Chyba prihlásenia: ${error.message}`, true));
        });
    }

    if (registerBtn) {
        registerBtn.addEventListener('click', () => {
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            createUserWithEmailAndPassword(auth, email, password)
                .catch(error => showToast(`Chyba registrácie: ${error.message}`, true));
        });
    }

    if (professorLoginBtn) {
        professorLoginBtn.addEventListener('click', () => {
            signInAnonymously(auth)
                .catch(error => showToast(`Chyba prihlásenia profesora: ${error.message}`, true));
        });
    }
}

export function handleSignOut() {
    signOut(auth).catch(error => console.error("Sign out error", error));
}
