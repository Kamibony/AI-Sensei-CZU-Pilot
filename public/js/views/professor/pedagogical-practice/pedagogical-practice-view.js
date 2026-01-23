import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';
import './observation-view.js';
import './microteaching-view.js';
import './portfolio-view.js';

export class PedagogicalPracticeView extends Localized(LitElement) {
    static properties = {
        activeTab: { type: String }
    };

    constructor() {
        super();
        this.activeTab = 'observations'; // Default tab
    }

    createRenderRoot() { return this; }

    render() {
        return html`
            <div class="h-full flex flex-col">
                <!-- Header -->
                <div class="flex-shrink-0 mb-6">
                    <h1 class="text-3xl font-extrabold text-slate-900 tracking-tight mb-2">Pedagogická praxe</h1>
                    <p class="text-slate-500">
                        Komplexní systém pro sledování vašeho pedagogického rozvoje: Náslechy, Výstupy a Reflexe.
                    </p>
                </div>

                <!-- Tabs -->
                <div class="flex-shrink-0 border-b border-slate-200 mb-6">
                    <nav class="-mb-px flex space-x-8" aria-label="Tabs">
                        ${this._renderTab('observations', 'Náslechy (Hospitace)', '🦻')}
                        ${this._renderTab('microteaching', 'Výstupy (Rozbor)', '👩‍🏫')}
                        ${this._renderTab('portfolio', 'Reflexe (Portfólio)', '📘')}
                    </nav>
                </div>

                <!-- Content -->
                <div class="flex-1 overflow-y-auto">
                    ${this._renderContent()}
                </div>
            </div>
        `;
    }

    _renderTab(id, label, icon) {
        const isActive = this.activeTab === id;
        const classes = isActive
            ? 'border-indigo-500 text-indigo-600'
            : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300';

        return html`
            <button
                @click="${() => this.activeTab = id}"
                class="${classes} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors"
            >
                <span>${icon}</span>
                ${label}
            </button>
        `;
    }

    _renderContent() {
        switch (this.activeTab) {
            case 'observations':
                return html`<observation-view></observation-view>`;
            case 'microteaching':
                return html`<microteaching-view></microteaching-view>`;
            case 'portfolio':
                return html`<portfolio-view></portfolio-view>`;
            default:
                return html`<observation-view></observation-view>`;
        }
    }
}
customElements.define('pedagogical-practice-view', PedagogicalPracticeView);
