import { onAuthStateChanged, signOut, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';
import { setupProfessorDashboard } from './professor.js';
import { setupStudentDashboard } from './student.js';
import { auth, db } from './firebase-init.js'; // Import services directly

let appContainer, mainAppTemplate;

// This function is called once from main.js to kick off the auth flow.
export function startAuthFlow() {
    appContainer = document.getElementById('app-container');
    mainAppTemplate = document.getElementById('main-app-template');

    // Centralized auth state listener
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            // User is signed out or page is loading for the first time.
            renderLogin();
        }
        // If user is signed in, the `login` function will handle the UI.
        // This prevents re-rendering the login screen on a page refresh when logged in.
    });
}

export function renderLogin() {
    if (!appContainer) return;
    appContainer.classList.remove('hidden');
    appContainer.innerHTML = document.getElementById('login-template').innerHTML;

    const aiAssistantBtn = document.getElementById('ai-assistant-btn');
    if (aiAssistantBtn) aiAssistantBtn.style.display = 'none';

    const handleProfessorLogin = async () => {
        try {
            if (!auth.currentUser || auth.currentUser.isAnonymous) {
                await signInAnonymously(auth);
            }
            sessionStorage.setItem('userRole', 'professor');
            await login('professor');
        } catch (error) {
            console.error("Professor anonymous sign-in failed:", error);
            showToast("Přihlášení pro profesora selhalo.", true);
        }
    };

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterLink = document.getElementById('show-register-form');
    const showLoginLink = document.getElementById('show-login-form');

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

    const handleStudentLogin = async () => {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value.trim();
        if (!email || !password) {
            showToast('Prosím, zadejte email a heslo.', true);
            return;
        }
        try {
            await signInWithEmailAndPassword(auth, email, password);
            sessionStorage.setItem('userRole', 'student');
            await login('student');
        } catch (error) {
            console.error("Student sign-in failed:", error);
            showToast('Přihlášení selhalo: Nesprávný email nebo heslo.', true);
        }
    };

    const handleStudentRegister = async () => {
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value.trim();
        if (!email || !password) {
            showToast('Prosím, zadejte email a heslo.', true);
            return;
        }
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, "students", userCredential.user.uid), {
                email: userCredential.user.email,
                createdAt: serverTimestamp()
            });
            sessionStorage.setItem('userRole', 'student');
            await login('student');
        } catch (error) {
            console.error("Student account creation failed:", error);
            showToast(`Registrace se nezdařila: ${error.message}`, true);
        }
    };

    document.getElementById('login-professor').addEventListener('click', handleProfessorLogin);
    document.getElementById('login-btn').addEventListener('click', handleStudentLogin);
    document.getElementById('register-btn').addEventListener('click', handleStudentRegister);
}

export async function logout() {
    try {
        await signOut(auth);
        sessionStorage.removeItem('userRole');
        renderLogin(); // Go back to login screen after sign out
    } catch (error) {
        console.error("Sign-out failed:", error);
        showToast("Odhlášení selhalo.", true);
    }
}

async function login(role) {
    if (!appContainer || !mainAppTemplate) return;

    appContainer.innerHTML = '';
    const clone = mainAppTemplate.content.cloneNode(true);
    appContainer.appendChild(clone);

    document.getElementById('ai-assistant-btn').style.display = 'flex';
    document.getElementById('logout-btn').addEventListener('click', logout);

    if (role === 'professor') {
        await setupProfessorDashboard();
    } else {
        await setupStudentDashboard();
    }

    appContainer.classList.remove('hidden');
}