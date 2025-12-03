import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import * as firebaseInit from '../../firebase-init.js';
import { translationService } from '../../utils/translation-service.js'; // Uistite sa, že je importovaný

export class ProfessorHeader extends LitElement {
    static properties = {
        user: { type: Object },
        currentPath: { type: String },
        isMenuOpen: { type: Boolean }
    };

    constructor() {
        super();
        this.user = null;
        this.currentPath = window.location.pathname;
        this.isMenuOpen = false;
    }

    createRenderRoot() {
        return this;
    }

    _handleLogout() {
        firebaseInit.logout();
    }

    _toggleMenu() {
        this.isMenuOpen = !this.isMenuOpen;
    }

    // === NOVÁ METÓDA PRE ZMENU JAZYKA ===
    _handleLanguageChange(e) {
        const selectedLang = e.target.value;
        translationService.changeLanguage(selectedLang);
    }

    render() {
        // Získame aktuálny jazyk pre nastavenie "selected" v dropdowne
        const currentLang = translationService.currentLanguage;

        return html`
            <header class="bg-white border-b border-slate-200 sticky top-0 z-50">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="flex justify-between h-16">
                        <div class="flex">
                            <div class="flex-shrink-0 flex items-center">
                                <span class="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
                                    AI Sensei
                                </span>
                            </div>
                            <div class="hidden sm:ml-6 sm:flex sm:space-x-8">
                                <a href="/professor/dashboard" 
                                   class="${this.currentPath.includes('dashboard') ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'} inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                                    Dashboard
                                </a>
                                <a href="/professor/students" 
                                   class="${this.currentPath.includes('students') ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'} inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                                    Studenti
                                </a>
                                <a href="/professor/library" 
                                   class="${this.currentPath.includes('library') ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'} inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">
                                    Knihovna
                                </a>
                            </div>
                        </div>

                        <div class="flex items-center gap-4">
                            
                            <div class="relative">
                                <select 
                                    @change="${this._handleLanguageChange}"
                                    class="appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2 pr-8 cursor-pointer"
                                >
                                    <option value="cs" ?selected="${currentLang === 'cs'}">🇨🇿 Česky</option>
                                    <option value="pt-br" ?selected="${currentLang === 'pt-br'}">🇧🇷 Português</option>
                                </select>
                                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                            </div>
                            <div class="ml-3 relative">
                                <div>
                                    <button @click="${this._toggleMenu}" class="bg-white rounded-full flex text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500" id="user-menu-button" aria-expanded="false" aria-haspopup="true">
                                        <span class="sr-only">Open user menu</span>
                                        <div class="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                                            ${this.user?.email ? this.user.email[0].toUpperCase() : 'P'}
                                        </div>
                                    </button>
                                </div>

                                ${this.isMenuOpen ? html`
                                    <div class="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-50" role="menu" aria-orientation="vertical" aria-labelledby="user-menu-button" tabindex="-1">
                                        <div class="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
                                            ${this.user?.email || 'Profesor'}
                                        </div>
                                        <a href="/professor/settings" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">Nastavení</a>
                                        <a href="#" @click="${this._handleLogout}" class="block px-4 py-2 text-sm text-red-600 hover:bg-red-50" role="menuitem">Odhlásit se</a>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </header>
        `;
    }
}
customElements.define('professor-header', ProfessorHeader);
