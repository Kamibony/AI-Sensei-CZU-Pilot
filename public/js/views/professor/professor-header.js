import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { handleLogout } from '../../auth.js';
import { auth } from '../../firebase-init.js';
import { Localized } from '../../utils/localization-mixin.js';

export class ProfessorHeader extends Localized(LitElement) {
    static properties = {
        userEmail: { state: true }
    };

    constructor() {
        super();
        this.userEmail = '';
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        const user = auth.currentUser;
        if (user) {
            this.userEmail = user.email || 'User';
        }
    }

    render() {
        return html`
            <div data-tour="header-start" class="flex flex-col w-full">
                <header class="bg-white border-b border-slate-200 sticky top-0 z-30 h-16 flex-shrink-0">
                    <div class="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
                        <div class="flex items-center gap-4">
                            <button @click="${() => document.dispatchEvent(new CustomEvent('toggle-sidebar'))}"
                                    class="md:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-lg">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                                </svg>
                            </button>

                            <div class="hidden md:flex items-center gap-2 text-slate-400">
                                <span class="text-sm font-medium text-slate-900">${this.t('header.brand')}</span>
                            </div>
                        </div>

                        <div class="flex items-center gap-4">
                            <button @click="${() => this.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'wizard' }, bubbles: true, composed: true }))}"
                                    class="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm font-medium">
                                <span>✨</span>
                                <span>${this.t('wizard.action.create') || 'Create New'}</span>
                            </button>

                            <div class="flex items-center gap-3 pl-4 border-l border-slate-200">
                                <div class="text-right hidden sm:block">
                                    <div class="text-sm font-medium text-slate-900">${this.userEmail}</div>
                                    <div class="text-xs text-slate-500">${this.t('header.roleProfessor')}</div>
                                </div>
                                <button @click="${handleLogout}"
                                        class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        title="${this.t('header.logout')}">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </header>
            </div>
        `;
    }
}
customElements.define('professor-header', ProfessorHeader);
