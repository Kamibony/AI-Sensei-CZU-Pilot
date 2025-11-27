// public/js/views/professor/professor-header.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { auth } from '../../firebase-init.js';
import { translationService } from '../../utils/translation-service.js';

export class ProfessorHeader extends LitElement {
    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        // Subscribe to language changes
        this._langUnsubscribe = translationService.subscribe(() => this.requestUpdate());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._langUnsubscribe) {
            this._langUnsubscribe();
        }
    }

    _renderAvatar() {
        const t = (key) => translationService.t(key);
        const user = auth.currentUser;
        if (user && user.photoURL) {
            return html`<img src="${user.photoURL}" alt="${t('professor.profile_image_alt')}" class="h-8 w-8 rounded-full">`;
        }
        // Fallback to initials or a generic icon
        const name = user ? user.displayName || user.email : '';
        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        return html`
            <div class="h-8 w-8 rounded-full bg-green-700 flex items-center justify-center text-xs font-bold text-white">
                ${initials || 'P'}
            </div>
        `;
    }

    render() {
        const t = (key) => translationService.t(key);
        const user = auth.currentUser;
        const displayName = user ? user.displayName || user.email || 'Profesor' : t('common.loading');

        return html`
            <header class="flex-shrink-0 bg-white shadow-md">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="flex items-center justify-between h-16">
                        <div>
                            <h1 class="text-xl font-bold text-slate-800">${t('professor.header_title')}</h1>
                        </div>
                        <div class="flex items-center space-x-3">
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
