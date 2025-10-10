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
            // If user is null or role is missing, clear session and show login
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

    appContainer.innerHTML = ''; // Clear previous content
    appContainer.appendChild(template.content.cloneNode(true));

    // Attach event listeners to the newly created elements
    document.getElementById('login-professor').addEventListener('click', handleProfessorLogin);
    
    const studentContainer = document.getElementById('student-login-container');
    if (!studentContainer) return;

    studentContainer.querySelector('#login-btn').addEventListener('click', handleStudentLogin);
    studentContainer.querySelector('#register-btn').addEventListener('click', handleStudentRegister);

    const loginForm = studentContainer.querySelector('#login-form');
    const registerForm = studentContainer.querySelector('#register-form');

    studentContainer.querySelector('#show-register-form').addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    });
    studentContainer.querySelector('#show-login-form').addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    });
}

async function handleProfessorLogin() {
    try {
        // Set role first to prevent race condition with onAuthStateChanged
        sessionStorage.setItem('userRole', 'professor');
        await signInAnonymously(auth);
        // onAuthStateChanged will now handle the UI transition.
    } catch (error) {
        // Clear the role if login fails
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
        // Set role first to prevent race condition
        sessionStorage.setItem('userRole', 'student');
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will now handle the UI transition.
    } catch (error) {
        // Clear the role if login fails
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
        // Set role first to prevent race condition
        sessionStorage.setItem('userRole', 'student');
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "students", userCredential.user.uid), { email: userCredential.user.email, createdAt: serverTimestamp() });
        // onAuthStateChanged will now handle the UI transition.
    } catch (error) {
        // Clear the role if registration fails
        sessionStorage.removeItem('userRole');
        console.error("Student account creation failed:", error);
        showToast(`Registrace se nezdařila: ${error.message}`, true);
    }
}

export async function handleLogout() {
    sessionStorage.removeItem('userRole'); // Ensure role is cleared immediately
    await signOut(auth);
    // onAuthStateChanged will handle rendering the login screen
}