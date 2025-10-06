// public/js/auth.js

import { onAuthStateChanged, signOut, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- App State (passed from app.js) ---
let auth;
let db;
let showToast;
let login; // This function will be passed from app.js to handle role-specific UI rendering

// --- DOM Elements ---
const appContainer = () => document.getElementById('app-container');

export function initializeAuth(appAuth, appDb, appShowToast, appLogin) {
    auth = appAuth;
    db = appDb;
    showToast = appShowToast;
    login = appLogin;

    // The single, central auth state listener
    onAuthStateChanged(auth, (user) => {
        // On auth state change (login/logout), always reset to the login screen.
        // The `login` function will then handle rendering the correct UI if the user is authenticated.
        sessionStorage.removeItem('userRole');
        renderLogin();
    });
}

export function renderLogin() {
    if (!appContainer()) return;
    appContainer().classList.remove('hidden');
    appContainer().innerHTML = document.getElementById('login-template').innerHTML;

    // Hide AI assistant button on login page
    const assistantBtn = document.getElementById('ai-assistant-btn');
    if (assistantBtn) assistantBtn.style.display = 'none';

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterLink = document.getElementById('show-register-form');
    const showLoginLink = document.getElementById('show-login-form');

    // Event listeners for toggling between login and registration forms
    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    });

    // Attach event listeners for login/registration actions
    document.getElementById('login-professor').addEventListener('click', handleProfessorLogin);
    document.getElementById('login-btn').addEventListener('click', handleStudentLogin);
    document.getElementById('register-btn').addEventListener('click', handleStudentRegister);
}

async function handleProfessorLogin() {
    try {
        // Professor login remains anonymous for simplicity
        if (!auth.currentUser || auth.currentUser.isAnonymous) {
             await signInAnonymously(auth);
        }
        sessionStorage.setItem('userRole', 'professor');
        await login('professor');
    } catch (error) {
        console.error("Professor anonymous sign-in failed:", error);
        showToast("Přihlášení pro profesora selhalo.", true);
    }
}

async function handleStudentLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!email || !password) {
        showToast('Prosím, zadejte email a heslo.', true);
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        console.log('Student signed in successfully.');
        sessionStorage.setItem('userRole', 'student');
        await login('student');
    } catch (error) {
        console.error("Student sign-in failed:", error);
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
            showToast('Přihlášení selhalo: Nesprávný email nebo heslo.', true);
        } else {
            showToast(`Přihlášení selhalo: ${error.message}`, true);
        }
    }
}

async function handleStudentRegister() {
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value.trim();

    if (!email || !password) {
        showToast('Prosím, zadejte email a heslo.', true);
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        console.log('New student account created.');

        // Create a corresponding document in the 'students' collection
        await setDoc(doc(db, "students", userCredential.user.uid), {
            email: userCredential.user.email,
            createdAt: serverTimestamp()
        });
        console.log('Student document created in Firestore.');

        sessionStorage.setItem('userRole', 'student');
        await login('student');
    } catch (error) {
        console.error("Student account creation failed:", error);
        if (error.code === 'auth/email-already-in-use') {
            showToast('Registrace se nezdařila: Tento email je již používán.', true);
        } else {
            showToast(`Registrace se nezdařila: ${error.message}`, true);
        }
    }
}

export async function handleLogout() {
    try {
        await signOut(auth);
        sessionStorage.removeItem('userRole');
        // onAuthStateChanged will handle rendering the login screen
    } catch (error) {
        console.error("Sign-out failed:", error);
        showToast("Odhlášení selhalo.", true);
    }
}