import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from './firebase-init.js';
import { showToast } from './utils.js';

const auth = getAuth();
let appContainerRef;

// Funkcia na zobrazenie prihlasovacieho formulára
function showLoginForm() {
    if (!appContainerRef) return;
    appContainerRef.innerHTML = `
        <div class="flex items-center justify-center min-h-screen bg-slate-100 px-4">
            <div class="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
                <h1 class="text-3xl font-extrabold text-slate-800 mb-2 text-center">Vítejte v AI Sensei</h1>
                <p class="text-slate-500 mb-6 text-center">Přihlaste se ke svému účtu.</p>
                <form id="login-form">
                    <div class="mb-4">
                        <label for="login-email" class="block font-medium text-slate-600 mb-1">Email</label>
                        <input type="email" id="login-email" required class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                    </div>
                    <div class="mb-6">
                        <label for="login-password" class="block font-medium text-slate-600 mb-1">Heslo</label>
                        <input type="password" id="login-password" required class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                    </div>
                    <button type="submit" id="login-btn" class="w-full bg-green-700 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-800 transition-colors">Přihlásit se</button>
                </form>
                <p class="text-center mt-6 text-sm">
                    Nemáte účet? <a href="#" id="show-register" class="font-semibold text-green-700 hover:underline">Zaregistrujte se</a>
                </p>
            </div>
        </div>
    `;
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        handleLogin(email, password);
    });
    document.getElementById('show-register').addEventListener('click', (e) => {
        e.preventDefault();
        showRegistrationForm();
    });
}

// Funkcia na zobrazenie registračného formulára
function showRegistrationForm() {
    if (!appContainerRef) return;
    appContainerRef.innerHTML = `
        <div class="flex items-center justify-center min-h-screen bg-slate-100 px-4">
            <div class="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
                <h1 class="text-3xl font-extrabold text-slate-800 mb-2 text-center">Vytvořit nový účet</h1>
                <p class="text-slate-500 mb-6 text-center">Začněte svou cestu s AI Sensei.</p>
                <form id="register-form">
                    <div class="mb-4">
                        <label for="register-email" class="block font-medium text-slate-600 mb-1">Email</label>
                        <input type="email" id="register-email" required class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                    </div>
                    <div class="mb-6">
                        <label for="register-password" class="block font-medium text-slate-600 mb-1">Heslo</label>
                        <input type="password" id="register-password" required class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                    </div>
                    <button type="submit" id="register-btn" class="w-full bg-green-700 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-800 transition-colors">Zaregistrovat se</button>
                </form>
                <p class="text-center mt-6 text-sm">
                    Máte již účet? <a href="#" id="show-login" class="font-semibold text-green-700 hover:underline">Přihlaste se</a>
                </p>
            </div>
        </div>
    `;
    document.getElementById('register-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        handleRegistration(email, password);
    });
    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        showLoginForm();
    });
}

// Hlavná inicializačná funkcia pre autentifikáciu
export function initAuth(appContainer) {
    appContainerRef = appContainer;
    showLoginForm();
}

// Funkcia na spracovanie registrácie
async function handleRegistration(email, password) {
    const registerBtn = document.getElementById('register-btn');
    const originalBtnText = registerBtn.innerHTML;
    registerBtn.innerHTML = `<div class="spinner"></div> Registruji...`;
    registerBtn.disabled = true;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Vytvorenie dokumentu študenta v databáze
        const token = `TGM-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        await setDoc(doc(db, "students", user.uid), {
            email: user.email,
            createdAt: serverTimestamp(),
            name: '', // Meno sa doplní neskôr
            telegramLinkToken: token
        });

        // ÚSPECH: Zobrazenie správy a prepnutie na prihlásenie
        showToast("Registrace úspěšná! Nyní se můžete přihlásit.");
        showLoginForm();

    } catch (error) {
        // Spracovanie chýb
        let message = "Při registraci došlo k chybě.";
        if (error.code === 'auth/email-already-in-use') {
            message = "Tento email je již zaregistrován.";
        } else if (error.code === 'auth/weak-password') {
            message = "Heslo je příliš slabé. Musí mít alespoň 6 znaků.";
        }
        showToast(message, true); // true pre zobrazenie chybovej správy
    } finally {
        // Obnovenie tlačidla, aj keď sa to už neukáže po presmerovaní
        if (document.getElementById('register-btn')) {
            registerBtn.innerHTML = originalBtnText;
            registerBtn.disabled = false;
        }
    }
}

// Funkcia na spracovanie prihlásenia
async function handleLogin(email, password) {
    const loginBtn = document.getElementById('login-btn');
    const originalBtnText = loginBtn.innerHTML;
    loginBtn.innerHTML = `<div class="spinner"></div> Přihlašuji...`;
    loginBtn.disabled = true;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // Po úspešnom prihlásení sa o zobrazenie panelu postará onAuthStateChanged v app.js
        // Tu môžeme zobraziť krátku správu, ak chceme
        showToast("Přihlášení úspěšné!");

    } catch (error) {
        // Spracovanie chýb
        let message = "Při přihlašování došlo k chybě.";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            message = "Nesprávný email nebo heslo.";
        }
        showToast(message, true);
    } finally {
        // V prípade chyby obnovíme tlačidlo
        if (document.getElementById('login-btn')) {
            loginBtn.innerHTML = originalBtnText;
            loginBtn.disabled = false;
        }
    }
}

// Funkcia na odhlásenie
export async function handleLogout() {
    try {
        await signOut(auth);
        showToast("Odhlášení proběhlo úspěšně.");
        // onAuthStateChanged v app.js sa postará o zobrazenie prihlasovacej obrazovky
    } catch (error) {
        console.error("Chyba při odhlašování:", error);
        showToast("Při odhlašování došlo k chybě.", true);
    }
}
