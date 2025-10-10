import { onAuthStateChanged, signOut, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
import { auth, db } from './firebase-init.js';

let loginSuccessCallback;

export function startAuthFlow(loginCallback) {
    loginSuccessCallback = loginCallback;
    onAuthStateChanged(auth, (user) => {
        const role = sessionStorage.getItem('userRole');
        if (user && role) {
            loginSuccessCallback(role);
        } else {
            sessionStorage.removeItem('userRole');
            renderLogin();
        }
    });
}

function renderLogin() {
    const appContainer = document.getElementById('app-container');
    if (!appContainer) return;

    const template = document.getElementById('login-template');
    if (!template) return;

    appContainer.innerHTML = '';
    appContainer.appendChild(template.content.cloneNode(true));

    document.getElementById('login-professor')?.addEventListener('click', handleProfessorLogin);
    
    const studentContainer = document.getElementById('student-login-container');
    if (!studentContainer) return;

    studentContainer.querySelector('#login-btn')?.addEventListener('click', handleStudentLogin);
    studentContainer.querySelector('#register-btn')?.addEventListener('click', handleStudentRegister);

    const loginForm = studentContainer.querySelector('#login-form');
    const registerForm = studentContainer.querySelector('#register-form');

    studentContainer.querySelector('#show-register-form')?.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    });
    studentContainer.querySelector('#show-login-form')?.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    });
}

async function handleProfessorLogin() {
    try {
        sessionStorage.setItem('userRole', 'professor');
        await signInAnonymously(auth);
    } catch (error) {
        sessionStorage.removeItem('userRole');
        console.error("Professor anonymous sign-in failed:", error);
        showToast("Přihlášení pro profesora selhalo.", true);
    }
}

async function handleStudentLogin() {
    const email = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-password')?.value.trim();
    if (!email || !password) { showToast('Prosím, zadejte email a heslo.', true); return; }

    try {
        sessionStorage.setItem('userRole', 'student');
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        sessionStorage.removeItem('userRole');
        console.error("Student sign-in failed:", error);
        showToast('Přihlášení selhalo: Nesprávný email nebo heslo.', true);
    }
}

async function handleStudentRegister() {
    const email = document.getElementById('register-email')?.value.trim();
    const password = document.getElementById('register-password')?.value.trim();
    if (!email || !password) { showToast('Prosím, zadejte email a heslo.', true); return; }

    try {
        sessionStorage.setItem('userRole', 'student');
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);

        // VRÁTENÉ: Generovanie a uloženie Telegram tokenu
        const telegramToken = 'tg_' + Date.now() + Math.random().toString(36).substring(2, 8);

        await setDoc(doc(db, "students", userCredential.user.uid), { 
            email: userCredential.user.email, 
            createdAt: serverTimestamp(),
            telegramConnectionToken: telegramToken // Pridaný token
        });
        
    } catch (error) {
        sessionStorage.removeItem('userRole');
        console.error("Student account creation failed:", error);
        showToast(`Registrace se nezdařila: ${error.message}`, true);
    }
}

export async function handleLogout() {
    await signOut(auth);
    sessionStorage.removeItem('userRole');
    // onAuthStateChanged sa postará o vykreslenie login obrazovky
    window.location.reload(); // Pre istotu obnovíme stránku
}
