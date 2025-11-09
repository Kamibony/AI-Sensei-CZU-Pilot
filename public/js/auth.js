import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    GoogleAuthProvider, 
    signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    doc, 
    setDoc, 
    getDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from './firebase-init.js';
import { showToast } from './utils.js';

// --- DOM Elements ---
let loginFormContainer;
let registerFormContainer;

export function initAuthListeners() {
    const appContainer = document.getElementById('app-container');

    appContainer.addEventListener('click', (e) => {
        if (e.target.id === 'show-register-form') {
            e.preventDefault();
            toggleForms(true);
        } else if (e.target.id === 'show-login-form') {
            e.preventDefault();
            toggleForms(false);
        } else if (e.target.id === 'login-btn' || e.target.closest('#login-form-element')) {
             // Handled by submit event if it's a form, but keeping for button clicks outside form if needed
        } else if (e.target.id === 'register-btn' || e.target.closest('#register-form-element')) {
             // Handled by submit event
        } else if (e.target.id === 'login-professor') {
             handleProfessorLogin();
        }
    });

    // Use event delegation for forms to handle dynamic rendering
    appContainer.addEventListener('submit', async (e) => {
        if (e.target.id === 'login-form-element') {
            e.preventDefault();
            await handleLogin(e);
        } else if (e.target.id === 'register-form-element') {
            e.preventDefault();
            await handleRegister(e);
        }
    });
}

function toggleForms(showRegister) {
    loginFormContainer = document.getElementById('login-form');
    registerFormContainer = document.getElementById('register-form');

    if (showRegister) {
        loginFormContainer.classList.add('hidden');
        registerFormContainer.classList.remove('hidden');
    } else {
        loginFormContainer.classList.remove('hidden');
        registerFormContainer.classList.add('hidden');
    }
    // Vyčistit chyby při přepínání
    clearErrors();
}

function clearErrors() {
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');
    if (loginError) loginError.classList.add('hidden');
    if (registerError) registerError.classList.add('hidden');
}

async function handleLogin(event) {
    // event.preventDefault() is already called in the event listener
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const email = emailInput.value;
    const password = passwordInput.value;
    const errorDiv = document.getElementById('login-error');

    try {
        if (errorDiv) errorDiv.classList.add('hidden');
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged in app.js will handle redirect
    } catch (error) {
        console.error("Error signing in:", error);
        if (errorDiv) {
            let message = "Nastala chyba při přihlášení.";
            switch (error.code) {
                case 'auth/invalid-credential':
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                    message = "Nesprávný email nebo heslo.";
                    break;
                case 'auth/invalid-email':
                    message = "Neplatný formát emailu.";
                    break;
                case 'auth/too-many-requests':
                    message = "Příliš mnoho pokusů. Zkuste to prosím později.";
                    break;
                case 'auth/user-disabled':
                    message = "Tento účet byl zablokován.";
                    break;
            }
            errorDiv.textContent = message;
            errorDiv.classList.remove('hidden');
        } else {
             showToast("Chyba přihlášení: " + error.message, 'error');
        }
    }
}

async function handleRegister(event) {
    // event.preventDefault() is already called
    const emailInput = document.getElementById('register-email');
    const passwordInput = document.getElementById('register-password');
    const email = emailInput.value;
    const password = passwordInput.value;
    const errorDiv = document.getElementById('register-error');

    try {
        if (errorDiv) errorDiv.classList.add('hidden');
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Create user document in Firestore with 'student' role
        await setDoc(doc(db, "users", user.uid), {
            email: user.email,
            role: 'student',
            createdAt: serverTimestamp()
        });

        showToast("Registrace úspěšná!", 'success');
        // onAuthStateChanged will handle redirect
    } catch (error) {
        console.error("Error registering:", error);
        if (errorDiv) {
            let message = "Nastala chyba při registraci.";
            switch (error.code) {
                case 'auth/email-already-in-use':
                    message = "Tento email je již používán.";
                    break;
                case 'auth/weak-password':
                    message = "Heslo je příliš slabé (musí mít alespoň 6 znaků).";
                    break;
                case 'auth/invalid-email':
                     message = "Neplatný formát emailu.";
                     break;
            }
            errorDiv.textContent = message;
            errorDiv.classList.remove('hidden');
        } else {
            showToast("Chyba registrace: " + error.message, 'error');
        }
    }
}

async function handleProfessorLogin() {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        // onAuthStateChanged will handle redirect and role check
    } catch (error) {
        console.error("Error with Google sign-in:", error);
        showToast("Chyba přihlášení přes Google.", 'error');
    }
}

export async function handleLogout() {
    try {
        await signOut(auth);
        showToast("Byli jste odhlášeni.", 'info');
        // onAuthStateChanged will handle redirect to login
    } catch (error) {
        console.error("Error signing out:", error);
        showToast("Chyba při odhlašování.", 'error');
    }
}
