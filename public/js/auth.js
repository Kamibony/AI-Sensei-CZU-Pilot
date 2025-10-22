// Súbor: public/js/auth.js
// OPRAVA 2: Použitie metódy onAuthStateChanged priamo z inicializovaného auth objektu

import * as firebaseInit from './firebase-init.js';
import { showToast } from './utils.js';

// Import funkcií priamo z Firebase Auth SDK modulu - POTREBUJEME ICH PRE OSTATNÉ OPERÁCIE
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    getIdTokenResult,
    deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

// Import inicializovaných služieb z firebase-init.js
const auth = firebaseInit.auth;         // Initializovaná Auth služba
const functions = firebaseInit.functions; // Initializovaná Functions služba

// Kontrola, či sa auth objekt úspešne importoval
if (!auth) {
    console.error("CRITICAL: Firebase Auth service not initialized or imported correctly from firebase-init.js!");
    // Zobrazíme chybu používateľovi
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        appContainer.innerHTML = `<p class="p-8 text-center text-red-600">Chyba inicializácie Firebase. Skúste obnoviť stránku.</p>`;
    }
    // Zastavíme ďalšie vykonávanie, aby sme predišli ďalším chybám
    throw new Error("Firebase Auth service not available.");
}

/**
 * Registruje posluchače pro ověřování stavu přihlášení.
 * @param {function} callback - Funkce, která se zavolá při změně stavu přihlášení.
 */
export function onAuthStateChanged(callback) {
    // === HLAVNÁ ZMENA: Používame metódu priamo z objektu auth ===
    try {
        auth.onAuthStateChanged(async (user) => { // Voláme metódu na inicializovanom objekte
            let idTokenResult = null;
            if (user) {
                try {
                    idTokenResult = await getIdTokenResult(user, true); // getIdTokenResult stále potrebujeme z SDK importu
                } catch (error) {
                    console.error("Error getting ID token result:", error);
                }
            }
            callback(user, idTokenResult);
        }, (error) => {
            // Callback pre chybu pri registrácii listenera (menej časté, ale pre istotu)
            console.error("Error attaching onAuthStateChanged listener:", error);
            showToast("Chyba pri sledovaní stavu prihlásenia.", true);
        });
    } catch (error) {
         console.error("Failed to initialize onAuthStateChanged listener:", error);
         showToast("Kritická chyba pri inicializácii prihlásenia.", true);
    }
    // ==========================================================
}

/**
 * Přihlásí uživatele.
 * @param {string} email
 * @param {string} password
 */
async function handleLogin(email, password) {
    const errorEl = document.getElementById('login-error');
    if (!errorEl) return; // Kontrola
    try {
        errorEl.textContent = ''; // Vyčistit předchozí chyby
        await signInWithEmailAndPassword(auth, email, password); // Používame SDK funkciu
    } catch (error) {
        console.error("Login failed:", error);
        errorEl.textContent = "Přihlášení se nezdařilo. Zkontrolujte e-mail a heslo.";
    }
}

/**
 * Zaregistruje nového uživatele.
 * @param {string} email
 * @param {string} password
 * @param {string} inviteCode
 */
async function handleRegistration(email, password, inviteCode) {
    const errorEl = document.getElementById('register-error');
    if (!errorEl) return; // Kontrola
    let newUser = null;

    try {
        errorEl.textContent = '';
        const userCredential = await createUserWithEmailAndPassword(auth, email, password); // SDK funkcia
        newUser = userCredential.user;
        const uid = newUser.uid;

        errorEl.textContent = 'Váš účet se vytváří, čekejte prosím...';
        errorEl.classList.remove('text-red-500');
        errorEl.classList.add('text-blue-500');

        const processRegistration = httpsCallable(functions, 'processRegistration'); // SDK funkcia + inicializovaný 'functions'
        const result = await processRegistration({
            uid: uid,
            email: email,
            inviteCode: inviteCode || null
        });

        if (result.data.status === 'success') {
            showToast(`Účet pro ${result.data.role} úspěšně vytvořen!`);
            errorEl.textContent = '';
        } else {
            throw new Error(result.data.message || 'Neznámá chyba při zpracování registrace.');
        }

    } catch (error) {
        console.error("Registration failed:", error);
        if (newUser) {
            try {
                await deleteUser(newUser); // SDK funkcia
                console.log(`Successfully deleted orphaned auth user: ${email}`);
            } catch (deleteError) {
                console.error(`Failed to delete orphaned auth user ${email}:`, deleteError);
            }
        }
        if (error.code === 'functions/not-found' || error.message.includes('Invalid invite code')) {
            errorEl.textContent = 'Registrace se nezdařila: Zadaný pozývací kód je neplatný.';
        } else if (error.code === 'auth/email-already-in-use') {
            errorEl.textContent = 'Tento e-mail je již používán.';
        } else if (error.code === 'auth/weak-password') {
            errorEl.textContent = 'Heslo je příliš slabé.';
        } else {
            errorEl.textContent = 'Registrace se nezdařila: ' + error.message;
        }
        errorEl.classList.add('text-red-500');
        errorEl.classList.remove('text-blue-500');
    }
}


/**
 * Odhlásí uživatele.
 */
export async function handleLogout() {
    try {
        await signOut(auth); // SDK funkcia
    } catch (error) {
        console.error("Logout failed:", error);
        showToast("Odhlášení se nezdařilo.", true);
    }
}

/**
 * Přepíná mezi přihlašovacím a registračním formulářem.
 */
function setupAuthTabs() {
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const formLogin = document.getElementById('login-form');
    const formRegister = document.getElementById('register-form');

    tabLogin?.addEventListener('click', () => {
        formLogin?.classList.remove('hidden');
        formRegister?.classList.add('hidden');
        tabLogin?.classList.add('border-green-700', 'text-green-700');
        tabRegister?.classList.remove('border-green-700', 'text-green-700');
        tabRegister?.classList.add('border-transparent', 'text-slate-500');
    });

    tabRegister?.addEventListener('click', () => {
        formLogin?.classList.add('hidden');
        formRegister?.classList.remove('hidden');
        tabLogin?.classList.remove('border-green-700', 'text-green-700');
        tabLogin?.classList.add('border-transparent', 'text-slate-500');
        tabRegister?.classList.add('border-green-700', 'text-green-700');
    });
}

/**
 * Registruje posluchače pro formuláře přihlášení a registrace.
 * Volá se z app.js, když je uživatel odhlášen.
 */
export function setupAuthFormListeners() {
    setupAuthTabs();

    const loginForm = document.getElementById('login-form-inputs');
    loginForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('login-email'); // Kontrola
        const passwordInput = document.getElementById('login-password'); // Kontrola
        if (emailInput && passwordInput) {
             handleLogin(emailInput.value, passwordInput.value);
        }
    });

    const registerForm = document.getElementById('register-form-inputs');
    registerForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('register-email'); // Kontrola
        const passwordInput = document.getElementById('register-password'); // Kontrola
        const inviteCodeInput = document.getElementById('register-invite-code'); // Kontrola
         if (emailInput && passwordInput && inviteCodeInput) {
            handleRegistration(emailInput.value, passwordInput.value, inviteCodeInput.value);
        }
    });
}
