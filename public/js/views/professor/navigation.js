import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import * as firebaseInit from '../../firebase-init.js';
import { Localized } from '../../utils/localization-mixin.js';

export class ProfessorNavigation extends Localized(LitElement) {
    static properties = {
        currentView: { type: String }
    };

    createRenderRoot() { return this; }

    _handleNav(view) {
        this.dispatchEvent(new CustomEvent('navigate', { 
            detail: { view },
            bubbles: true, 
            composed: true 
        }));
    }

    _isAdmin() {
        const user = firebaseInit.auth.currentUser;
        return user && user.email === 'profesor@profesor.cz';
    }

    _renderNavItem(id, icon, label, isBottom = false) {
        const isActive = this.currentView === id;
        
        const baseClasses = "nav-item w-full flex items-center p-2.5 rounded-xl transition-all duration-200 group relative overflow-hidden mb-1";
        const activeClasses = (id === 'admin' || id === 'admin-dashboard' || id === 'admin-settings')
            ? "bg-yellow-50 text-yellow-700 font-bold shadow-sm" 
            : "bg-indigo-50 text-indigo-700 font-bold shadow-sm";
            
        const inactiveClasses = (id === 'admin' || id === 'admin-dashboard' || id === 'admin-settings')
            ? "text-slate-500 hover:bg-yellow-50 hover:text-yellow-700"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-900";

        const classes = `${baseClasses} ${isActive ? activeClasses : inactiveClasses}`;

        return html`
            <button 
                @click=${() => this._handleNav(id)}
                class="${classes}"
                data-view="${id}"
            >
                <span class="text-xl mr-3 relative z-10 group-hover:scale-110 transition-transform duration-200">${icon}</span>
                <span class="text-sm font-medium relative z-10">${label}</span>
            </button>
        `;
    }

    render() {
        return html`
            <div class="hidden md:flex w-64 h-full flex-col border-r border-slate-100 bg-white flex-shrink-0 z-50">
                <div class="h-20 flex items-center justify-start px-6 cursor-pointer group flex-shrink-0 border-b border-transparent"
                     @click=${() => this._handleNav('dashboard')}>
                    <div class="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-md shadow-indigo-200 font-bold text-lg flex-shrink-0 group-hover:scale-105 transition-transform">
                        A
                    </div>
                    <span class="ml-3 font-bold text-slate-800 text-lg tracking-tight group-hover:text-indigo-600 transition-colors">
                        AI Sensei
                    </span>
                </div>

                <div class="flex-1 overflow-y-auto custom-scrollbar flex flex-col w-full px-3 py-4 space-y-1">
                    <div class="px-3 mb-2 mt-2">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            ${this.t('nav.organization')}
                        </span>
                    </div>

                    ${this._renderNavItem('dashboard', '🏠', this.t('nav.dashboard'))}
                    ${this._renderNavItem('classes', '🏫', this.t('nav.classes'))}
                    ${this._renderNavItem('students', '👥', this.t('nav.students'))}
                    ${this._renderNavItem('interactions', '💬', this.t('nav.interactions'))}
                    ${this._renderNavItem('analytics', '📊', this.t('nav.analytics'))}
                    ${this._renderNavItem('practice', '🛠️', this.t('nav.practice') || 'Odborný výcvik')}
                    ${this._renderNavItem('pedagogical-practice', '🎓', 'Pedagogická praxe')}

                    <div class="my-4 border-t border-slate-100 mx-3"></div>

                    <div class="px-3 mb-2">
                        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            ${this.t('nav.creative_studio')}
                        </span>
                    </div>

                    ${this._renderNavItem('architect', '🏗️', this.t('nav.architect'))}
                    ${this._renderNavItem('library', '📚', this.t('nav.library'))}
                    ${this._renderNavItem('timeline', '📅', this.t('nav.timeline'))}
                    ${this._renderNavItem('media', '📁', this.t('nav.media'))}
                    ${this._renderNavItem('editor', '✨', this.t('nav.editor'))}
                </div>

                <div class="flex-shrink-0 p-4 border-t border-slate-100 bg-white space-y-1">
                    ${this._isAdmin() 
                        ? this._renderNavItem('admin-dashboard', '⚙️', this.t('nav.admin'), true) 
                        : ''}
                </div>
            </div>
        `;
    }
}
customElements.define('professor-navigation', ProfessorNavigation);
