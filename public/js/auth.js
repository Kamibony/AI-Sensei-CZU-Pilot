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

// Pôvodný názov funkcie zachovaný pre kompatibilitu s app.js
export function initAuth() {
    const appContainer = document.getElementById('app-container');

    appContainer.addEventListener('click', (e) => {
        if (e.target.id === 'show-register-form') {
            e.preventDefault();
            toggleForms(true);
        } else if (e.target.id === 'show-login-form') {
            e.preventDefault();
            toggleForms(false);
        } else if (e.target.id === 'login-professor') {
             handleProfessorLogin();
        }
    });

    // Pridaný listener pro 'submit' událost formulářů (lepší UX než jen click na tlačítko)
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
    // event.preventDefault() je zavoláno v event listeneru
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const email = emailInput.value;
    const password = passwordInput.value;
    const errorDiv = document.getElementById('login-error');

    try {
        if (errorDiv) errorDiv.classList.add('hidden');
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged v app.js se postará o přesměrování
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
             // Fallback pokud by HTML element neexistoval
             showToast("Chyba přihlášení: " + error.message, 'error');
        }
    }
}

async function handleRegister(event) {
    // event.preventDefault() je zavoláno v event listeneru
    const emailInput = document.getElementById('register-email');
    const passwordInput = document.getElementById('register-password');
    const email = emailInput.value;
    const password = passwordInput.value;
    const errorDiv = document.getElementById('register-error');

    try {
        if (errorDiv) errorDiv.classList.add('hidden');
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // ZMENA: Ukladáme do kolekcie 'students' namiesto 'users'
        await setDoc(doc(db, "students", user.uid), {
            email: user.email,
            role: 'student',
            createdAt: serverTimestamp(),
            name: '' // Pridané prázdne meno pre konzistenciu
        });

        showToast("Registrace úspěšná!", 'success');
        // onAuthStateChanged se postará o přesměrování
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
        // onAuthStateChanged se postará o zbytek
    } catch (error) {
        console.error("Error with Google sign-in:", error);
        // Tu sa zobrazí chyba, ak nie je Google Sign-in povolený v konzole
        showToast("Chyba přihlášení přes Google: " + error.message, 'error');
    }
}

export async function handleLogout() {
    try {
        await signOut(auth);
        showToast("Byli jste odhlášeni.", 'info');
        // onAuthStateChanged se postará o přesměrování na login
    } catch (error) {
        console.error("Error signing out:", error);
        showToast("Chyba při odhlašování.", 'error');
    }
}
