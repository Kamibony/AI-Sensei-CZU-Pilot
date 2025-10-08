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
    appContainer.innerHTML = document.getElementById('login-template').innerHTML;

    document.getElementById('login-professor').addEventListener('click', handleProfessorLogin);
    document.getElementById('login-btn').addEventListener('click', handleStudentLogin);
    document.getElementById('register-btn').addEventListener('click', handleStudentRegister);
    
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    document.getElementById('show-register-form').addEventListener('click', (e) => { e.preventDefault(); loginForm.classList.add('hidden'); registerForm.classList.remove('hidden'); });
    document.getElementById('show-login-form').addEventListener('click', (e) => { e.preventDefault(); registerForm.classList.add('hidden'); loginForm.classList.remove('hidden'); });
}

async function handleProfessorLogin() {
    try {
        await signInAnonymously(auth);
        sessionStorage.setItem('userRole', 'professor');
        await loginSuccessCallback('professor');
    } catch (error) {
        console.error("Professor anonymous sign-in failed:", error);
        showToast("Přihlášení pro profesora selhalo.", true);
    }
}

async function handleStudentLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    if (!email || !password) { showToast('Prosím, zadejte email a heslo.', true); return; }
    try {
        await signInWithEmailAndPassword(auth, email, password);
        sessionStorage.setItem('userRole', 'student');
        await loginSuccessCallback('student');
    } catch (error) {
        console.error("Student sign-in failed:", error);
        showToast('Přihlášení selhalo: Nesprávný email nebo heslo.', true);
    }
}

async function handleStudentRegister() {
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value.trim();
    if (!email || !password) { showToast('Prosím, zadejte email a heslo.', true); return; }
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "students", userCredential.user.uid), { email: userCredential.user.email, createdAt: serverTimestamp() });
        sessionStorage.setItem('userRole', 'student');
        await loginSuccessCallback('student');
    } catch (error) {
        console.error("Student account creation failed:", error);
        showToast(`Registrace se nezdařila: ${error.message}`, true);
    }
}

export async function handleLogout() {
    sessionStorage.removeItem('userRole');
    await signOut(auth);
    renderLogin();
}