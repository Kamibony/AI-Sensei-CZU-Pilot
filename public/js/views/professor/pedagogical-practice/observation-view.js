import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

export class ObservationView extends LitElement {
    createRenderRoot() { return this; }

    render() {
        return html`
            <div class="p-6 bg-white rounded-xl shadow-sm border border-slate-200">
                <div class="text-center py-12">
                    <div class="text-6xl mb-4">🦻</div>
                    <h2 class="text-2xl font-bold text-slate-800 mb-2">Náslechy (Hospitace)</h2>
                    <p class="text-slate-500 mb-6 max-w-lg mx-auto">
                        Zde budete zaznamenávat náslechy z výuky. Modul bude obsahovat formulář pro záznam 7 didaktických otázek a časovou osu hodiny.
                    </p>
                    <button class="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
                        Zaznamenat nový náslech
                    </button>
                </div>
            </div>
        `;
    }
}
customElements.define('observation-view', ObservationView);
