import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

export class AdminDashboardView extends LitElement {
    createRenderRoot() { return this; }

    _navigateTo(view) {
        this.dispatchEvent(new CustomEvent('navigate', {
            detail: { view },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
            <div data-tour="admin-dashboard-start" class="h-full flex flex-col bg-slate-50 overflow-hidden">
                <header class="p-8 border-b border-slate-200 bg-white flex-shrink-0">
                    <h1 class="text-3xl font-bold text-slate-900">Administrace systému</h1>
                    <p class="text-slate-500 mt-2 text-lg">Centrální správa aplikace AI Sensei.</p>
                </header>

                <div class="flex-1 overflow-y-auto p-8">
                    <div class="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">

                        <div @click=${() => this._navigateTo('admin')} 
                             class="group bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer flex flex-col">
                            <div class="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform">
                                👥
                            </div>
                            <h2 class="text-xl font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">Správa uživatelů</h2>
                            <p class="text-slate-500 mb-6 flex-1">
                                Přidávání nových profesorů, správa studentů, resetování hesel a přiřazování rolí.
                            </p>
                            <div class="flex items-center text-indigo-600 font-semibold text-sm">
                                Otevřít správu uživatelů →
                            </div>
                        </div>

                        <div @click=${() => this._navigateTo('admin-settings')} 
                             class="group bg-white p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-purple-300 transition-all cursor-pointer flex flex-col">
                            <div class="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-2xl mb-6 group-hover:scale-110 transition-transform">
                                ✨
                            </div>
                            <h2 class="text-xl font-bold text-slate-900 mb-2 group-hover:text-purple-600 transition-colors">Nastavení AI (Magie)</h2>
                            <p class="text-slate-500 mb-6 flex-1">
                                Konfigurace globálních promptů, limity generování, nastavení modelů a výchozí hodnoty pro editory.
                            </p>
                            <div class="flex items-center text-purple-600 font-semibold text-sm">
                                Otevřít nastavení AI →
                            </div>
                        </div>

                        <div class="bg-slate-50 p-8 rounded-2xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-center opacity-60">
                            <div class="text-3xl mb-4">📊</div>
                            <h3 class="font-bold text-slate-700">Analytika systému</h3>
                            <p class="text-sm text-slate-500 mt-1">Připravujeme...</p>
                        </div>

                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('admin-dashboard-view', AdminDashboardView);
