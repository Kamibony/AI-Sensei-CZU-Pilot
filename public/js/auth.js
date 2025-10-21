// Súbor: public/js/auth.js
import * as firebaseInit from './firebase-init.js'; // <-- OPRAVENÉ
import { showToast } from './utils.js'; // <-- OPRAVENÉ

// Import funkcí z Firebase SDK
const {
    getAuth,
    onAuthStateChanged: fbOnAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    getIdTokenResult,
    deleteUser
} = (window.firebase.auth);

const { getFunctions, httpsCallable } = (window.firebase.functions);

const auth = getAuth();
const functions = getFunctions();

/**
 * Registruje posluchače pro ověřování stavu přihlášení.
 * @param {function} callback - Funkce, která se zavolá při změně stavu přihlášení.
 */
export function onAuthStateChanged(callback) {
    fbOnAuthStateChanged(auth, async (user) => {
        let idTokenResult = null;
        if (user) {
            try {
                // Vynutíme obnovení tokenu, abychom získali nejnovější custom claims (role)
                idTokenResult = await getIdTokenResult(user, true);
            } catch (error) {
                console.error("Error getting ID token result:", error);
            }
        }
        callback(user, idTokenResult);
    });
}

/**
 * Přihlásí uživatele.
 * @param {string} email 
 * @param {string} password 
 */
async function handleLogin(email, password) {
    const errorEl = document.getElementById('login-error');
    try {
        errorEl.textContent = ''; // Vyčistit předchozí chyby
        await signInWithEmailAndPassword(auth, email, password);
        // Není třeba nic vracet, onAuthStateChanged listener to zpracuje
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
    let newUser = null; // Uchováme si nového uživatele pro případné smazání

    try {
        errorEl.textContent = ''; // Vyčistit chyby

        // 1. Vytvoření uživatele ve Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        newUser = userCredential.user;
        const uid = newUser.uid;
        
        // Zobrazit zprávu o čekání
        errorEl.textContent = 'Váš účet se vytváří, čekejte prosím...';
        errorEl.classList.remove('text-red-500');
        errorEl.classList.add('text-blue-500');

        // 2. Volání backendové funkce pro zpracování registrace (nastavení rolí, DB záznam)
        const processRegistration = httpsCallable(functions, 'processRegistration');
        const result = await processRegistration({ 
            uid: uid, 
            email: email, 
            inviteCode: inviteCode || null // Poslat kód, pokud existuje
        });

        // 3. Zpracování výsledku
        if (result.data.status === 'success') {
            // Registrace úspěšná
            showToast(`Účet pro ${result.data.role} úspěšně vytvořen!`);
            // Není třeba nic dělat, onAuthStateChanged listener přihlásí uživatele
            errorEl.textContent = ''; // Vyčistit zprávu o čekání
        } else {
            // Pokud by backend vrátil chybu (i když by měl házet HttpsError)
            throw new Error(result.data.message || 'Neznámá chyba při zpracování registrace.');
        }

    } catch (error) {
        console.error("Registration failed:", error);

        // Pokud registrace selhala (např. neplatný kód), musíme smazat vytvořený Auth účet
        if (newUser) {
            try {
                await deleteUser(newUser);
                console.log(`Successfully deleted orphaned auth user: ${email}`);
            } catch (deleteError) {
                console.error(`Failed to delete orphaned auth user ${email}:`, deleteError);
            }
        }

        // Zobrazení chybové hlášky uživateli
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
        await signOut(auth);
        // Není třeba nic vracet, onAuthStateChanged listener to zpracuje
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
        formLogin.classList.remove('hidden');
        formRegister.classList.add('hidden');
        tabLogin.classList.add('border-green-700', 'text-green-700');
        tabRegister.classList.remove('border-green-700', 'text-green-700');
        tabRegister.classList.add('border-transparent', 'text-slate-500');
    });

    tabRegister?.addEventListener('click', () => {
        formLogin.classList.add('hidden');
        formRegister.classList.remove('hidden');
        tabLogin.classList.remove('border-green-700', 'text-green-700');
        tabLogin.classList.add('border-transparent', 'text-slate-500');
        tabRegister.classList.add('border-green-700', 'text-green-700');
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
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        handleLogin(email, password);
    });

    const registerForm = document.getElementById('register-form-inputs');
    registerForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const inviteCode = document.getElementById('register-invite-code').value;
        handleRegistration(email, password, inviteCode);
    });
}
