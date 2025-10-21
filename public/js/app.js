// Súbor: public/js/app.js
import * as firebaseInit from './firebase-init.js'; // <-- OPRAVENÉ
import { onAuthStateChanged } from './auth.js'; // <-- OPRAVENÉ
import { initProfessorDashboard } from './professor.js'; // <-- OPRAVENÉ
import { initStudentDashboard } from './student.js'; // <-- OPRAVENÉ

const appContainer = document.getElementById('app-container');
const loadingSpinner = document.getElementById('loading-spinner');

// Globální Auth State Listener
onAuthStateChanged(async (user, idTokenResult) => {
    if (user) {
        // Uživatel je přihlášen
        // Získání role z custom claims
        const role = idTokenResult?.claims?.role;

        // Zobrazení načítacího spinneru, než se načte správný panel
        appContainer.innerHTML = ''; // Vyčistit, pokud tam bylo přihlášení
        loadingSpinner.classList.remove('hidden');

        console.log(`User ${user.email} logged in with role: ${role}`);

        if (role === 'professor') {
            // Inicializace profesorského rozhraní
            // Posíláme celý user objekt, který obsahuje uid, email atd.
            initProfessorDashboard(user); 
        } else {
            // Výchozí role je student
            // Inicializace studentského rozhraní
            initStudentDashboard(user);
        }

        // Skrytí spinneru (může být lepší skrýt až po vykreslení panelu)
        // Jednotlivé dashboardy by měly spravovat spinner samy
        // loadingSpinner.classList.add('hidden');

    } else {
        // Uživatel je odhlášen
        console.log("User is logged out.");
        loadingSpinner.classList.add('hidden');
        // Zobrazení přihlašovací/registrační stránky (je v index.html)
        appContainer.innerHTML = `
            <div class="flex items-center justify-center min-h-screen bg-slate-100">
                <div class="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
                    <div class="flex justify-center border-b mb-6">
                        <button id="tab-login" class="px-6 py-2 text-lg font-semibold border-b-2 border-green-700 text-green-700">Přihlášení</button>
                        <button id="tab-register" class="px-6 py-2 text-lg font-semibold border-b-2 border-transparent text-slate-500 hover:text-green-700">Registrace</button>
                    </div>

                    <div id="login-form">
                        <h1 class="text-3xl font-extrabold text-slate-800 text-center mb-6">Vítejte zpět</h1>
                        <form id="login-form-inputs">
                            <div class="mb-4">
                                <label for="login-email" class="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                <input type="email" id="login-email" required class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                            </div>
                            <div class="mb-6">
                                <label for="login-password" class="block text-sm font-medium text-slate-700 mb-1">Heslo</label>
                                <input type="password" id="login-password" required class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                            </div>
                            <button type="submit" class="w-full bg-green-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-800 transition-colors">Přihlásit se</button>
                        </form>
                        <p id="login-error" class="text-red-500 text-sm mt-3 text-center"></p>
                    </div>

                    <div id="register-form" class="hidden">
                        <h1 class="text-3xl font-extrabold text-slate-800 text-center mb-6">Vytvořit účet</h1>
                        <form id="register-form-inputs">
                            <div class="mb-4">
                                <label for="register-email" class="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                <input type="email" id="register-email" required class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                            </div>
                            <div class="mb-4">
                                <label for="register-password" class="block text-sm font-medium text-slate-700 mb-1">Heslo (min. 6 znaků)</label>
                                <input type="password" id="register-password" required class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                            </div>
                             <div class="mb-6">
                                <label for="register-invite-code" class="block text-sm font-medium text-slate-700 mb-1">Pozývací kód (nepovinné)</label>
                                <input type="text" id="register-invite-code" class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="Kód pro profesory...">
                            </div>
                            <button type="submit" class="w-full bg-green-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-800 transition-colors">Zaregistrovat se</button>
                        </form>
                        <p id="register-error" class="text-red-500 text-sm mt-3 text-center"></p>
                    </div>
                    
                </div>
            </div>
        `;

        // Navázání event listenerů na nově vytvořené DOM elementy
        // Musí být voláno až poté, co je HTML vloženo do DOM
        firebaseInit.auth.setupAuthFormListeners();
    }
});
