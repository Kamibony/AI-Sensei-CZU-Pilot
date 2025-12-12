import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import './professor-header-editor.js';
import './ai-generator-panel.js';

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
            // Handle both string (legacy) and object/other formats if any
             const code = (typeof data === 'string' ? data : data?.mermaid) || '';

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

    _handleStartManual() {
        this._mermaidCode = 'graph TD\n  A[Start] --> B[Cíl]';
        this.save();
        setTimeout(() => this._renderDiagram(), 0);
    }

    render() {
        return html`
            <div class="h-full bg-slate-50 overflow-y-auto p-4 md:p-8">
                <div class="max-w-5xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden min-h-[800px] flex flex-col">
                    <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                    <div class="flex-1 flex flex-col">
                        ${!this._mermaidCode ? html`
                            <div class="flex-1 p-8">
                                <ai-generator-panel
                                    .lesson="${this.lesson}"
                                    contentType="mindmap"
                                    fieldToUpdate="mindmap"
                                    viewTitle="Generátor Mentálních Map"
                                    promptPlaceholder="Např.: Vývojová psychologie, Fotosyntéza..."
                                    description="Vytvořte si mentální mapu pomocí AI nebo začněte psát kód ručně."
                                    .files="${this.lesson?.ragFilePaths || []}"
                                >
                                </ai-generator-panel>

                                <div class="mt-8 pt-8 border-t border-slate-100 text-center">
                                    <button @click="${this._handleStartManual}" class="text-slate-400 hover:text-slate-600 text-sm font-medium transition-colors">
                                        Nebo začít s prázdnou mapou (Ručně)
                                    </button>
                                </div>
                            </div>
                        ` : html`
                            <div class="flex-1 flex flex-col md:flex-row h-full min-h-[600px]">
                                <!-- LEFT: Editor (50%) -->
                                <div class="w-full md:w-1/2 flex flex-col border-r border-slate-100 bg-slate-50">
                                    <div class="p-3 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
                                        <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Mermaid.js Editor</span>
                                        <a href="https://mermaid.js.org/intro/" target="_blank" class="text-xs text-indigo-600 hover:underline">Dokumentace</a>
                                    </div>
                                    <textarea
                                        .value="${this._mermaidCode}"
                                        @input="${this._handleInput}"
                                        class="flex-1 p-6 font-mono text-sm bg-slate-50 text-slate-700 resize-none focus:outline-none leading-relaxed w-full"
                                        spellcheck="false"
                                        placeholder="Zde pište kód diagramu..."
                                    ></textarea>
                                </div>

                                <!-- RIGHT: Preview (50%) -->
                                <div class="w-full md:w-1/2 bg-white relative flex flex-col">
                                     <div class="p-3 border-b border-slate-100 flex justify-between items-center bg-white z-10">
                                        <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Náhled</span>
                                        ${this._renderError ? html`<span class="text-xs text-red-500 bg-red-50 px-2 py-1 rounded border border-red-100">${this._renderError}</span>` : ''}
                                    </div>
                                    <div class="flex-1 overflow-auto p-4 flex items-center justify-center bg-dots">
                                        <div id="mermaid-preview" class="w-full h-full flex items-center justify-center transform transition-transform"></div>
                                    </div>
                                </div>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-mindmap', EditorViewMindmap);
