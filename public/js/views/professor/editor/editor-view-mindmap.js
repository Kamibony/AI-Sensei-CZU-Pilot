import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { callGenerateContent } from '../../../gemini-api.js';
import { showToast } from '../../../utils.js';
import './professor-header-editor.js';

export class EditorViewMindmap extends LitElement {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean },
        _mermaidCode: { state: true, type: String },
        _isGenerating: { state: true, type: Boolean },
        _renderError: { state: true, type: String }
    };

    constructor() {
        super();
        this.lesson = null;
        this._mermaidCode = '';
        this._isGenerating = false;
        this._renderError = null;
        this._debounceTimer = null;
    }

    createRenderRoot() { return this; }

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson')) {
            const data = this.lesson?.mindmap;
            const code = data?.mermaid || (typeof data === 'string' ? data : '');

            if (code && code !== this._mermaidCode) {
                this._mermaidCode = code;
                this._renderDiagram();
            } else if (!this._mermaidCode && !code) {
                 this._mermaidCode = '';
            }
        }
    }

    firstUpdated() {
        if (this._mermaidCode) {
            this._renderDiagram();
        }
    }

    setContentFromAi(data) {
        if (typeof data === 'string') {
            this._mermaidCode = data;
            this.save();
            this._renderDiagram();
        }
    }

    async _generateMindmap() {
        if (this._isGenerating) return;

        const title = this.lesson?.title || '';
        if (!title) {
            showToast("Chybí název lekce.", true);
            return;
        }

        this._isGenerating = true;
        this.requestUpdate();

        try {
            const prompt = `Vytvoř strukturu mentální mapy k tématu: ${title}. Výstup musí být POUZE validní kód pro Mermaid.js (typ graph TD). Nepoužívej markdown bloky, jen čistý text diagramu.`;

            const result = await callGenerateContent({
                contentType: 'mindmap',
                promptData: { userPrompt: prompt },
                filePaths: this.lesson.ragFilePaths ? this.lesson.ragFilePaths.map(f => f.fullPath).filter(p => p) : []
            });

            if (result.error) {
                throw new Error(result.error);
            }

            let rawText = result.text || result;
            let code = '';

            // Handle object response
            if (typeof rawText === 'object') {
                if (rawText.mermaid) {
                    code = rawText.mermaid;
                } else {
                     // Try to convert to string if it's not the expected structure
                     code = JSON.stringify(rawText);
                }
            } else {
                if (typeof rawText !== 'string') {
                    rawText = String(rawText);
                }
                // Cleanup markdown from string
                code = rawText.replace(/```mermaid/g, '').replace(/```/g, '').trim();
            }

            this._mermaidCode = code;
            this.save();
            this._renderDiagram();
            showToast("Mapa vygenerována!");

        } catch (e) {
            console.error(e);
            showToast("Chyba generování: " + e.message, true);
        } finally {
            this._isGenerating = false;
            this.requestUpdate();
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
        if (!container || !this._mermaidCode) {
            if (container) container.innerHTML = '';
            return;
        }

        try {
            this._renderError = null;
            container.innerHTML = '<div class="mermaid">' + this._mermaidCode + '</div>';

            if (window.mermaid) {
                // Mermaid might need a re-init or run
                // mermaid.init() deprecated in v10, use run
                await window.mermaid.run({
                    nodes: container.querySelectorAll('.mermaid')
                });
            }
        } catch (e) {
            console.error("Mermaid render error:", e);
            this._renderError = "Chyba syntaxe diagramu. Zkontrolujte kód.";
        }
    }

    save() {
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: { mindmap: this._mermaidCode },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
            <div class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving || this._isGenerating}"></professor-header-editor>
                <div class="flex-1 overflow-hidden relative">
                    <div class="h-full flex flex-col md:flex-row">
                        <!-- Editor Column -->
                        <div class="w-full md:w-1/3 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-700">
                            <div class="p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center">
                                <span class="font-mono text-xs font-bold uppercase">Mermaid Code</span>
                                <button @click=${this._generateMindmap} ?disabled=${this._isGenerating}
                                    class="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded transition-colors">
                                    ${this._isGenerating ? 'Generuji...' : '✨ AI Generátor'}
                                </button>
                            </div>
                            <textarea
                                .value=${this._mermaidCode}
                                @input=${this._handleInput}
                                class="w-full h-full bg-slate-900 p-4 font-mono text-sm focus:outline-none resize-none text-slate-300 leading-relaxed"
                                placeholder="graph TD&#10;    A[Start] --> B{Rozhodnutí}&#10;    B -->|Ano| C[Výsledek 1]&#10;    B -->|Ne| D[Výsledek 2]"
                            ></textarea>
                        </div>

                        <!-- Preview Column -->
                        <div class="w-full md:w-2/3 bg-slate-50 relative overflow-hidden flex flex-col">
                            <div class="p-4 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
                                <h3 class="font-bold text-slate-700">Náhled Mapy</h3>
                                ${this._renderError ? html`<span class="text-xs text-red-500 font-bold bg-red-50 px-2 py-1 rounded">${this._renderError}</span>` : ''}
                            </div>

                            <div class="flex-grow overflow-auto p-8 flex items-center justify-center bg-white" id="preview-scroll-area">
                                ${!this._mermaidCode ? html`
                                    <div class="text-center text-slate-400">
                                        <div class="text-4xl mb-2">🧠</div>
                                        <p>Zadejte kód nebo vygenerujte mapu pomocí AI.</p>
                                    </div>
                                ` : html`
                                    <div id="mermaid-preview" class="w-full h-full flex items-center justify-center"></div>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-mindmap', EditorViewMindmap);
