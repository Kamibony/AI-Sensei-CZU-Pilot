import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import './professor-header-editor.js';
import './ai-generator-panel.js'; // Import the AI panel

export class EditorViewMindmap extends LitElement {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean },
        _mermaidCode: { state: true, type: String },
        _renderError: { state: true, type: String }
    };

    constructor() {
        super();
        this.lesson = null;
        this._mermaidCode = '';
        this._renderError = null;
        this._debounceTimer = null;
    }

    createRenderRoot() { return this; }

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson')) {
            const data = this.lesson?.mindmap;
            // Handle both object (from AI) and string formats
            const code = data?.mermaid || (typeof data === 'string' ? data : '');

            if (code !== this._mermaidCode) {
                this._mermaidCode = code;
                if (code) {
                    // Defer render to allow DOM to update first
                    setTimeout(() => this._renderDiagram(), 0);
                }
            }
        }
    }

    firstUpdated() {
        if (this._mermaidCode) {
            this._renderDiagram();
        }
    }

    _handleInput(e) {
        this._mermaidCode = e.target.value;
        this.save();
        // Debounce rendering
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this._renderDiagram();
        }, 1000);
    }

    async _renderDiagram() {
        const container = this.renderRoot.querySelector('#mermaid-preview');
        if (!container) return;

        if (!this._mermaidCode) {
            container.innerHTML = '';
            return;
        }

        try {
            this._renderError = null;
            container.innerHTML = '<div class="mermaid">' + this._mermaidCode + '</div>';

            if (window.mermaid) {
                await window.mermaid.run({
                    nodes: container.querySelectorAll('.mermaid')
                });
            }
        } catch (e) {
            console.error("Mermaid render error:", e);
            this._renderError = "Chyba syntaxe diagramu.";
        }
    }

    save() {
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: { mindmap: this._mermaidCode },
            bubbles: true,
            composed: true
        }));
    }

    _switchToManual() {
        this._mermaidCode = "graph TD\n    A[Start] --> B{Rozhodnutí}\n    B -->|Ano| C[Výsledek 1]\n    B -->|Ne| D[Výsledek 2]";
        this.save();
        this._renderDiagram();
    }

    render() {
        const isEmpty = !this._mermaidCode;

        return html`
            <div class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <div class="max-w-5xl mx-auto w-full space-y-6">

                        <!-- Header / Title Area -->
                        <div class="mb-4">
                            <h2 class="text-2xl font-bold text-slate-800">Mentální Mapa</h2>
                            <p class="text-slate-500 text-sm">Vytvořte strukturu lekce pomocí diagramu.</p>
                        </div>

                        ${isEmpty ? html`
                            <!-- Magic / Empty State -->
                            <div class="space-y-6">
                                <ai-generator-panel
                                    .lesson="${this.lesson}"
                                    .files="${this.lesson?.ragFilePaths || []}"
                                    viewTitle="Vygenerovat Mapu"
                                    contentType="mindmap"
                                    fieldToUpdate="mindmap"
                                    description="Nechte AI vytvořit základní strukturu mapy z vašich podkladů."
                                    promptPlaceholder="Např. 'Vytvoř mapu, která vysvětluje koloběh vody v přírodě...'"
                                ></ai-generator-panel>

                                <div class="text-center pt-8 border-t border-slate-200">
                                    <p class="text-slate-500 mb-3 text-sm">Nebo začněte s prázdným plátnem</p>
                                    <button
                                        @click="${this._switchToManual}"
                                        class="px-5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm text-sm"
                                    >
                                        ✍️ Psát kód ručně
                                    </button>
                                </div>
                            </div>
                        ` : html`
                            <!-- Split View Editor -->
                            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-[600px] flex flex-col md:flex-row">

                                <!-- Left: Mermaid Code Editor -->
                                <div class="w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50">
                                    <div class="p-3 border-b border-slate-200 bg-white flex justify-between items-center">
                                        <span class="text-xs font-bold uppercase text-slate-500 tracking-wider">Mermaid.js Syntax</span>
                                        <a href="https://mermaid.js.org/intro/" target="_blank" class="text-xs text-indigo-600 hover:underline">Dokumentace</a>
                                    </div>
                                    <div class="flex-1 relative">
                                        <textarea
                                            .value=${this._mermaidCode}
                                            @input=${this._handleInput}
                                            class="w-full h-full p-4 font-mono text-sm bg-slate-50 text-slate-800 focus:outline-none resize-none leading-relaxed"
                                            placeholder="Zadejte kód diagramu..."
                                            spellcheck="false"
                                        ></textarea>
                                    </div>
                                </div>

                                <!-- Right: Live Preview -->
                                <div class="w-full md:w-1/2 bg-white flex flex-col relative">
                                    <div class="p-3 border-b border-slate-200 flex justify-between items-center bg-white z-10">
                                        <span class="text-xs font-bold uppercase text-slate-500 tracking-wider">Náhled</span>
                                        ${this._renderError ? html`
                                            <span class="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100 flex items-center">
                                                <svg class="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                Chyba syntaxe
                                            </span>
                                        ` : html`
                                            <span class="text-xs text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100 flex items-center">
                                                <svg class="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                                                Aktuální
                                            </span>
                                        `}
                                    </div>
                                    <div class="flex-1 overflow-auto p-6 flex items-center justify-center bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
                                        <div id="mermaid-preview" class="w-full h-full flex items-center justify-center transform transition-transform"></div>
                                    </div>
                                </div>
                            </div>

                            <div class="text-right">
                                <button
                                    @click="${() => { if(confirm('Opravdu chcete smazat mapu a začít znovu?')) { this._mermaidCode = ''; this.save(); } }}"
                                    class="text-xs text-red-500 hover:text-red-700 hover:underline px-4"
                                >
                                    Smazat a začít znovu
                                </button>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-mindmap', EditorViewMindmap);
