import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { auth } from '../../firebase-init.js';
import { translationService, SUPPORTED_LANGUAGES } from '../../utils/translation-service.js';
import { Localized } from '../../utils/localization-mixin.js';
import { handleLogout } from '../../auth.js';

export class ProfessorHeader extends Localized(LitElement) {
    
    static properties = {
        isMenuOpen: { state: true, type: Boolean },
        user: { state: true, type: Object }
    };

    constructor() {
        super();
        this.isMenuOpen = false;
        this.user = auth.currentUser;
    }

    createRenderRoot() { return this; }

    // Pridáme listener na zmeny auth stavu, aby sa meno načítalo správne
    connectedCallback() {
        super.connectedCallback();
        this.authUnsub = auth.onAuthStateChanged(user => {
            this.user = user;
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.authUnsub) this.authUnsub();
    }

    _toggleMenu() {
        this.isMenuOpen = !this.isMenuOpen;
    }

    async _handleLanguageChange(e) {
        await translationService.changeLanguage(e.target.value);
    }

    _handleLogoutClick(e) {
        e.preventDefault();
        handleLogout();
    }

    _renderAvatar() {
        if (this.user && this.user.photoURL) {
            return html`<img src="${this.user.photoURL}" alt="${this.t('professor.profile_image_alt')}" class="h-8 w-8 rounded-full object-cover">`;
        }
        const name = this.user ? this.user.displayName || this.user.email : '';
        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        return html`
            <div class="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-sm">
                ${initials || 'P'}
            </div>
        `;
    }

    render() {
        const displayName = this.user ? this.user.displayName || this.user.email || 'Profesor' : this.t('common.loading');
        const currentLang = translationService.currentLanguage;

        return html`
            <header class="bg-white border-b border-slate-200 sticky top-0 z-50">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="flex justify-between h-16">
                        <div class="flex items-center gap-4">
                            <span class="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 cursor-default">
                                AI Sensei
                            </span>
                        </div>

                        <div class="flex items-center gap-4">
                            
                            <div class="relative hidden sm:block">
                                <select 
                                    @change="${this._handleLanguageChange}"
                                    class="appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-full focus:ring-indigo-500 focus:border-indigo-500 block py-1.5 pl-3 pr-8 cursor-pointer font-medium hover:bg-slate-100 transition-colors"
                                >
                                    ${SUPPORTED_LANGUAGES.map(lang => html`
                                        <option value="${lang.code}" ?selected="${currentLang === lang.code}">
                                            ${lang.flag} ${lang.code.toUpperCase()}
                                        </option>
                                    `)}
                                </select>
                                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                            </div>

                            <div class="h-6 w-px bg-slate-200 hidden sm:block"></div>

                            <div class="relative ml-3">
                                <div>
                                    <button @click="${this._toggleMenu}" class="flex items-center gap-2 max-w-xs bg-white rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 p-1 pr-2 hover:bg-slate-50 transition-colors" id="user-menu-button" aria-expanded="false" aria-haspopup="true">
                                        ${this._renderAvatar()}
                                        <span class="hidden md:block text-sm font-medium text-slate-700 truncate max-w-[150px]">${displayName}</span>
                                        <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </button>
                                </div>

                                ${this.isMenuOpen ? html`
                                    <div class="origin-top-right absolute right-0 mt-2 w-56 rounded-xl shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-50 transform transition-all opacity-100 scale-100" role="menu">
                                        <div class="px-4 py-3 border-b border-slate-100">
                                            <p class="text-xs text-slate-500 uppercase tracking-wider font-semibold">Přihlášen jako</p>
                                            <p class="text-sm font-medium text-slate-900 truncate">${this.user?.email}</p>
                                        </div>
                                        
                                        <a href="/professor/settings" class="block px-4 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors" role="menuitem">
                                            ⚙️ ${this.t('nav.settings')}
                                        </a>
                                        
                                        <div class="sm:hidden px-4 py-2 border-t border-slate-100">
                                            <p class="text-xs text-slate-500 mb-2">Jazyk</p>
                                            <div class="flex gap-2">
                                                ${SUPPORTED_LANGUAGES.map(lang => html`
                                                    <button @click=${() => translationService.changeLanguage(lang.code)} class="px-2 py-1 text-xs rounded border ${currentLang === lang.code ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200'}">
                                                        ${lang.flag}
                                                    </button>
                                                `)}
                                            </div>
                                        </div>

                                        <a href="#" @click="${this._handleLogoutClick}" class="block px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors border-t border-slate-100" role="menuitem">
                                            🚪 ${this.t('common.logout')}
                                        </a>
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
