import { onAuthStateChanged, signOut, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js'; 
import { auth, db } from './firebase-init.js';

let loginSuccessCallback;

export function startAuthFlow(loginCallback) {
    loginSuccessCallback = loginCallback;
    onAuthStateChanged(auth, (user) => {
        const role = sessionStorage.getItem('userRole');
        if (user && role) {
            console.log(`Používateľ ${user.uid} je prihlásený s rolou ${role}. Spúšťam aplikáciu.`);
            loginSuccessCallback(role);
        } else {
            console.log("Používateľ nie je prihlásený. Zobrazujem prihlasovací formulár.");
            sessionStorage.clear(); // Vyčistíme všetko pre istotu
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
    document.getElementById('login-btn')?.addEventListener('click', handleStudentLogin);
    document.getElementById('register-btn')?.addEventListener('click', handleStudentRegister);
    document.getElementById('show-register-form')?.addEventListener('click', (e) => { e.preventDefault(); toggleForms(false); });
    document.getElementById('show-login-form')?.addEventListener('click', (e) => { e.preventDefault(); toggleForms(true); });
}

function toggleForms(showLogin) {
    document.getElementById('login-form').classList.toggle('hidden', !showLogin);
    document.getElementById('register-form').classList.toggle('hidden', showLogin);
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
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // Pri registrácii vytvoríme študentský profil
        await setDoc(doc(db, "students", userCredential.user.uid), { 
            email: userCredential.user.email, 
            createdAt: serverTimestamp(),
            name: '' // Prázdne meno, doplní si ho neskôr
        });
        
        sessionStorage.setItem('userRole', 'student');
        // Po úspešnej registrácii sa automaticky spustí onAuthStateChanged,
        // netreba volať loginSuccessCallback manuálne.

    } catch (error) {
        sessionStorage.removeItem('userRole');
        console.error("Student account creation failed:", error);
        showToast(`Registrace se nezdařila: ${error.message}`, true);
    }
}

export async function handleLogout() {
    await signOut(auth);
    sessionStorage.clear();
    window.location.reload();
}
