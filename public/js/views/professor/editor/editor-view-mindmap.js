import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';
import { sanitizeMermaidCode } from './utils-parsing.mjs';
import './professor-header-editor.js';
import './ai-generator-panel.js'; // Import the AI panel

export class EditorViewMindmap extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean },
        files: { type: Array },
        _mermaidCode: { state: true, type: String },
        _renderError: { state: true, type: String },
        _zoomLevel: { state: true, type: Number }
    };

    constructor() {
        super();
        this.lesson = null;
        this._mermaidCode = '';
        this._renderError = null;
        this._debounceTimer = null;
        this._zoomLevel = 1.0;
    }

    createRenderRoot() { return this; } // Light DOM enabled

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson')) {
            let data = this.lesson?.mindmap;
            let code = this._cleanInput(data);

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
        await this.updateComplete; // Wait for Lit update
        await new Promise(r => requestAnimationFrame(r)); // Wait for paint

        const container = this.renderRoot.querySelector('#mermaid-preview');
        if (!container) return;

        // Observability: Log the exact string being rendered
        console.log("Mermaid Rendering Code:", this._mermaidCode);

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
            console.error("Mermaid Render Error Detail:", e);
            this._renderError = `${this.t('editor.mindmap.error_syntax')}: ${e.message}`;
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

    _zoomIn() {
        this._zoomLevel = Math.min(this._zoomLevel + 0.1, 3.0);
    }

    _zoomOut() {
        this._zoomLevel = Math.max(this._zoomLevel - 0.1, 0.5);
    }

    _resetZoom() {
        this._zoomLevel = 1.0;
    }

    _cleanInput(data) {
        if (!data) return '';

        let code = '';

        // 1. Normalize object to string
        if (typeof data === 'object') {
             code = data.mermaid || data.mindmap || data.content || data.code || '';
        } else {
             code = String(data);
        }

        // 2. Strip Markdown code fences and language identifiers
        code = code.replace(/```[a-zA-Z0-9]*\n?/g, '').replace(/```/g, '');

        // 3. Trim whitespace
        code = code.trim();

        return code;
    }

    _repairMermaidCode(code) {
        if (!code) return "";
        let output = "";
        let i = 0;
        while (i < code.length) {
            const char = code[i];
            if (['[', '(', '{'].includes(char)) {
                const opener = char;
                const closer = opener === '[' ? ']' : opener === '(' ? ')' : '}';
                let content = "";
                let depth = 1;
                let j = i + 1;
                while (j < code.length && depth > 0) {
                    const c = code[j];
                    if (c === opener) depth++;
                    else if (c === closer) depth--;
                    if (depth > 0) content += c;
                    j++;
                }
                if (depth === 0) {
                    let clean = content.trim();
                    if (clean.startsWith('"') && clean.endsWith('"')) clean = clean.slice(1, -1);
                    clean = clean.replace(/"/g, "'");
                    output += `${opener}"${clean}"${closer}`;
                    i = j;
                    continue;
                }
            }
            output += char;
            i++;
        }
        return output;
    }

    // --- Phase 2: Editor Standardization ---
    _handleAiCompletion(e) {
        const data = e.detail.data;
        if (!data) return;

        // 1. Normalize & Phase 3: Definitive Parser
        // We use the new robust parser from utils-parsing.mjs
        const code = sanitizeMermaidCode(data);

        // 3. Assign & 4. Save
        if (code) {
            this._mermaidCode = code;
            this.save();
            this.requestUpdate();

            // Force immediate render attempt
            setTimeout(() => this._renderDiagram(), 0);
        }
    }

    render() {
        const isEmpty = !this._mermaidCode;

        // Explicit Context Injection for AI Panel
        // Ensure subject, topic, title, and targetAudience are passed as distinct properties.
        const aiContext = {};
        if (this.lesson) {
            aiContext.subject = this.lesson.subject || '';
            aiContext.topic = this.lesson.topic || '';
            aiContext.title = this.lesson.title || '';
            aiContext.targetAudience = this.lesson.targetAudience || '';
        }

        const inverseZoom = 100 / this._zoomLevel;

        return html`
            <div data-tour="editor-mindmap-start" class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <div class="max-w-5xl mx-auto w-full space-y-6">

                        <!-- Header / Title Area -->
                        <div class="mb-4">
                            <h2 class="text-2xl font-bold text-slate-800">${this.t('editor.mindmap.title')}</h2>
                            <p class="text-slate-500 text-sm">${this.t('editor.mindmap.subtitle')}</p>
                        </div>

                        ${isEmpty ? html`
                            <!-- Magic / Empty State -->
                            <div class="space-y-6">
                                <ai-generator-panel
                                    .lesson="${this.lesson}"
                                    .files="${this.files}"
                                    .context="${aiContext}"
                                    viewTitle="${this.t('editor.mindmap.ai_title')}"
                                    contentType="mindmap"
                                    fieldToUpdate="mindmap"
                                    description="${this.t('editor.mindmap.ai_description')}"
                                    promptPlaceholder="${this.t('editor.mindmap.ai_placeholder')}"
                                    @ai-completion="${this._handleAiCompletion}"
                                ></ai-generator-panel>

                                <div class="text-center pt-8 border-t border-slate-200">
                                    <p class="text-slate-500 mb-3 text-sm">${this.t('editor.mindmap.manual_placeholder')}</p>
                                    <button
                                        @click="${this._switchToManual}"
                                        class="px-5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm text-sm"
                                    >
                                        ✍️ ${this.t('editor.mindmap.manual_btn')}
                                    </button>
                                </div>
                            </div>
                        ` : html`
                            <!-- Split View Editor -->
                            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-[600px] flex flex-col md:flex-row">

                                <!-- Left: Mermaid Code Editor -->
                                <div class="w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50">
                                    <div class="p-3 border-b border-slate-200 bg-white flex justify-between items-center">
                                        <span class="text-xs font-bold uppercase text-slate-500 tracking-wider">${this.t('editor.mindmap.syntax_header')}</span>
                                        <a href="https://mermaid.js.org/intro/" target="_blank" class="text-xs text-indigo-600 hover:underline">${this.t('editor.mindmap.docs')}</a>
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
                                        <span class="text-xs font-bold uppercase text-slate-500 tracking-wider">${this.t('editor.mindmap.preview_header')}</span>
                                        ${this._renderError ? html`
                                            <span class="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100 flex items-center">
                                                <svg class="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                ${this._renderError}
                                            </span>
                                        ` : html`
                                            <span class="text-xs text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100 flex items-center">
                                                <svg class="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                                                ${this.t('editor.mindmap.status_current')}
                                            </span>
                                        `}
                                    </div>
                                    <div class="flex-1 overflow-auto p-6 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] relative">

                                        <!-- Floating Toolbar -->
                                        <div class="absolute top-4 right-4 flex flex-col gap-2 bg-white shadow-md rounded-lg p-1 z-20 border border-slate-200">
                                            <button @click="${() => this._zoomIn()}" class="p-2 hover:bg-slate-50 text-slate-600 rounded" title="Přiblížit (+)">
                                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                            </button>
                                            <button @click="${() => this._resetZoom()}" class="p-2 hover:bg-slate-50 text-slate-600 rounded" title="Resetovat (100%)">
                                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                            </button>
                                            <button @click="${() => this._zoomOut()}" class="p-2 hover:bg-slate-50 text-slate-600 rounded" title="Oddálit (-)">
                                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" /></svg>
                                            </button>
                                            <div class="text-[10px] text-center text-slate-400 font-mono border-t border-slate-100 pt-1">
                                                ${Math.round(this._zoomLevel * 100)}%
                                            </div>
                                        </div>

                                        <div style="width: ${this._zoomLevel * 100}%; height: ${this._zoomLevel * 100}%; min-width: 100%; min-height: 100%; overflow: visible;">
                                            <div id="mermaid-preview"
                                                 class="flex items-center justify-center origin-top-left transition-transform"
                                                 style="width: ${inverseZoom}%; height: ${inverseZoom}%; transform: scale(${this._zoomLevel}); min-height: 50px;"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="text-right">
                                <button
                                    @click="${() => { if(confirm(this.t('common.confirm_discard') !== 'common.confirm_discard' ? this.t('common.confirm_discard') : 'Opravdu chcete zahodit veškerý obsah a začít znovu?')) { this._mermaidCode = ''; this.save(); } }}"
                                    class="text-xs text-red-500 hover:text-red-700 hover:underline px-4"
                                >
                                    ${this.t('common.discard_restart') !== 'common.discard_restart' ? this.t('common.discard_restart') : 'Zahodit a začít znovu'}
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
