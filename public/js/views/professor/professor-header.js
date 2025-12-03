import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { auth } from '../../firebase-init.js';
// Importujeme službu AJ konfiguračnú konštantu
import { translationService, SUPPORTED_LANGUAGES } from '../../utils/translation-service.js';
// Importujeme náš nový Mixin
import { Localized } from '../../utils/localization-mixin.js';

// Použijeme Mixin: extends Localized(LitElement)
export class ProfessorHeader extends Localized(LitElement) {
    
    createRenderRoot() { return this; }

    // Poznámka: connectedCallback/disconnectedCallback pre preklady
    // už rieši Mixin 'Localized', takže ich tu nemusíme písať!

    _renderAvatar() {
        const user = auth.currentUser;
        if (user && user.photoURL) {
            return html`<img src="${user.photoURL}" alt="${this.t('professor.profile_image_alt')}" class="h-8 w-8 rounded-full">`;
        }
        const name = user ? user.displayName || user.email : '';
        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        return html`
            <div class="h-8 w-8 rounded-full bg-green-700 flex items-center justify-center text-xs font-bold text-white">
                ${initials || 'P'}
            </div>
        `;
    }

    async _handleLanguageChange(e) {
        const selectedLang = e.target.value;
        // Zavoláme zmenu jazyka. Vďaka Mixinu sa všetko prekreslí samo.
        await translationService.changeLanguage(selectedLang);
    }

    render() {
        const user = auth.currentUser;
        const displayName = user ? user.displayName || user.email || 'Profesor' : this.t('common.loading');
        const currentLang = translationService.currentLanguage;

        return html`
            <header class="flex-shrink-0 bg-white shadow-md z-50 relative">
                <div class="w-full px-4 sm:px-6 lg:px-8">
                    <div class="flex items-center justify-between h-16">
                        <div class="flex items-center gap-4">
                            <h1 class="text-xl font-bold text-slate-800">${this.t('professor.header_title')}</h1>
                        </div>
                        
                        <div class="flex items-center space-x-4">
                            <div class="relative">
                                <select 
                                    @change="${this._handleLanguageChange}"
                                    class="appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2 pr-8 cursor-pointer font-medium"
                                >
                                    ${SUPPORTED_LANGUAGES.map(lang => html`
                                        <option value="${lang.code}" ?selected="${currentLang === lang.code}">
                                            ${lang.flag} ${lang.name}
                                        </option>
                                    `)}
                                </select>
                            </div>

                            <div class="h-6 w-px bg-slate-200"></div>

                            ${this._renderAvatar()}
                            <span class="text-sm font-medium text-slate-700 hidden md:block">${displayName}</span>
                        </div>
                    </div>
                </div>
            </header>
        `;
    }
}
customElements.define('professor-header', ProfessorHeader);
