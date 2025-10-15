import { onAuthStateChanged, signOut, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js'; 
import { auth, db } from './firebase-init.js';

let loginSuccessCallback;

/**
 * Hlavná funkcia, ktorá riadi autentifikáciu v aplikácii.
 */
export function startAuthFlow(loginCallback) {
    loginSuccessCallback = loginCallback;
    
    // Listener, ktorý reaguje na zmenu stavu prihlásenia (prihlásenie, odhlásenie, prvé načítanie)
    onAuthStateChanged(auth, (user) => {
        // Po načítaní stránky skontrolujeme, či má používateľ v session uleženú rolu
        const role = sessionStorage.getItem('userRole');

        // PODMIENKA PRE SPUSTENIE APLIKÁCIE:
        // Používateľ musí byť prihlásený (objekt 'user' existuje) A zároveň musí mať nastavenú rolu.
        if (user && role) {
            console.log(`Používateľ ${user.uid} je prihlásený s rolou ${role}. Spúšťam aplikáciu.`);
            loginSuccessCallback(role);
        } 
        // VŽDY, KEĎ PODMIENKA NIE JE SPLNENÁ:
        // Ak používateľ nie je prihlásený alebo chýba rola, zobrazíme prihlasovací formulár.
        else {
            console.log("Používateľ nie je prihlásený alebo chýba rola. Zobrazujem prihlasovací formulár.");
            sessionStorage.clear(); // Pre istotu vyčistíme session storage
            renderLogin();
        }
    });
}

/**
 * Vykreslí prihlasovací/registračný formulár.
 */
function renderLogin() {
    const appContainer = document.getElementById('app-container');
    if (!appContainer) return;
    const template = document.getElementById('login-template');
    if (!template) return;

    appContainer.innerHTML = '';
    appContainer.appendChild(template.content.cloneNode(true));

    // Pripojíme listenery na všetky tlačidlá
    document.getElementById('login-professor')?.addEventListener('click', handleProfessorLogin);
    document.getElementById('login-btn')?.addEventListener('click', handleStudentLogin);
    document.getElementById('register-btn')?.addEventListener('click', handleStudentRegister);
    document.getElementById('show-register-form')?.addEventListener('click', (e) => { e.preventDefault(); toggleForms(false); });
    document.getElementById('show-login-form')?.addEventListener('click', (e) => { e.preventDefault(); toggleForms(true); });
}

/**
 * Prepína medzi prihlasovacím a registračným formulárom.
 */
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
        showToast('Přihlášení selhalo: Nesprávný email nebo heslo.', true);
    }
}

/**
 * Spracuje registráciu nového študenta.
 */
async function handleStudentRegister() {
    const email = document.getElementById('register-email')?.value.trim();
    const password = document.getElementById('register-password')?.value.trim();
    if (!email || !password) { showToast('Prosím, zadejte email a heslo.', true); return; }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // --- KĽÚČOVÁ OPRAVA ---
        // Hneď po vytvorení účtu vytvoríme pre študenta aj profilový dokument v databáze.
        await setDoc(doc(db, "students", user.uid), { 
            email: user.email, 
            createdAt: serverTimestamp(),
            name: '' // Meno si študent doplní po prvom prihlásení
        });
        
        // Nastavíme rolu a necháme onAuthStateChanged, aby používateľa automaticky prihlásil.
        sessionStorage.setItem('userRole', 'student');
        
    } catch (error) {
        sessionStorage.removeItem('userRole');
        showToast(`Registrace se nezdařila: ${error.message}`, true);
    }
}

export async function handleLogout() {
    await signOut(auth);
    sessionStorage.clear();
    window.location.reload();
}
