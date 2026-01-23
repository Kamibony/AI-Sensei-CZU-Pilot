import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

export class PortfolioView extends LitElement {
    createRenderRoot() { return this; }

    render() {
        return html`
            <div class="p-6 bg-white rounded-xl shadow-sm border border-slate-200">
                <div class="text-center py-12">
                    <div class="text-6xl mb-4">📘</div>
                    <h2 class="text-2xl font-bold text-slate-800 mb-2">Reflexe (Portfólio)</h2>
                    <p class="text-slate-500 mb-6 max-w-lg mx-auto">
                        Finální agregace dat pro zápočet. Zde se vygeneruje portfolio z vašich náslechů a rozborů, doplněné o SWOT analýzu a sebereflexi.
                    </p>
                    <button class="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700 transition-colors">
                        Generovat portfolio
                    </button>
                </div>
            </div>
        `;
    }
}
customElements.define('portfolio-view', PortfolioView);
