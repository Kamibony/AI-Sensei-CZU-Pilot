import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from '../../../firebase-init.js';
import { Localized } from '../../../utils/localization-mixin.js';
import './professor-header-editor.js';
import './ai-generator-panel.js';

export class EditorViewComic extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean },
        files: { type: Array },
        _generatingPanels: { state: true, type: Object }
    };

    constructor() {
        super();
        this._generatingPanels = {};
    }

    createRenderRoot() { return this; } // Light DOM enabled

    _getScript() {
        let script = [];
        const raw = this.lesson?.comic_script;

        if (raw) {
            if (Array.isArray(raw)) {
                script = raw;
            } else if (typeof raw === 'object' && Array.isArray(raw.comic_script)) {
                 script = raw.comic_script;
            } else if (typeof raw === 'string') {
                 try {
                     const parsed = JSON.parse(raw);
                     script = parsed.comic_script || (Array.isArray(parsed) ? parsed : []);
                 } catch(e) { console.warn("Failed to parse comic script", e); }
            }
        }
        return script;
    }

    _updateScript(newScript) {
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: { partial: { comic_script: newScript } },
            bubbles: true,
            composed: true
        }));
    }

    _handlePanelChange(index, field, value) {
        const script = [...this._getScript()];
        if (script[index]) {
            script[index] = { ...script[index], [field]: value };
            this._updateScript(script);
        }
    }

    _addPanel() {
        const script = [...this._getScript()];
        script.push({
            panel_number: script.length + 1,
            description: '',
            dialogue: ''
        });
        this._updateScript(script);
    }

    _deletePanel(index) {
        const script = [...this._getScript()];
        script.splice(index, 1);
        // Re-number panels
        const renumbered = script.map((panel, i) => ({ ...panel, panel_number: i + 1 }));
        this._updateScript(renumbered);
    }

    // --- Phase 2: Editor Standardization ---
    _handleAiCompletion(e) {
        const data = e.detail.data;
        if (!data) return;

        // 1. Normalize
        let script = [];
        if (typeof data === 'object') {
             if (Array.isArray(data.panels)) script = data.panels;
             else if (Array.isArray(data)) script = data;
        } else if (typeof data === 'string') {
             try {
                 const parsed = JSON.parse(data);
                 if (parsed.panels) script = parsed.panels;
                 else if (Array.isArray(parsed)) script = parsed;
             } catch (e) { console.warn("AI Comic Parse Error", e); }
        }

        // 3. Assign & 4. Save
        if (script.length > 0) {
             // Ensure panel numbers and map caption to dialogue
             script = script.map((p, i) => ({
                 ...p,
                 panel_number: i + 1,
                 dialogue: p.caption || p.dialogue || ''
             }));

             this.lesson.comic_script = script;
             this._updateScript(script);
             this.requestUpdate();
        }
    }

    _handleDiscard() {
        if (confirm(this.t('common.confirm_discard') || "Opravdu chcete zahodit veškerý obsah a začít znovu?")) {
            this.lesson.comic_script = [];
            this._updateScript([]);
            this.requestUpdate();
        }
    }

    async _generatePanelImage(index) {
        if (this._generatingPanels[index]) return;

        const script = this._getScript();
        const panel = script[index];
        if (!panel || !panel.description || panel.description.trim() === '') {
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: 'Popis panelu je prázdný.', type: 'error' }
            }));
            return;
        }

        this._generatingPanels = { ...this._generatingPanels, [index]: true };
        this.requestUpdate();

        try {
            const generateImage = httpsCallable(functions, 'generateComicPanelImage');
            const result = await generateImage({
                lessonId: this.lesson.id,
                panelIndex: index,
                panelPrompt: panel.description
            });

            if (result.data && result.data.imageUrl) {
                this._handlePanelChange(index, 'image_url', result.data.imageUrl);
                window.dispatchEvent(new CustomEvent('show-toast', {
                    detail: { message: 'Obrázek úspěšně vygenerován.', type: 'success' }
                }));
            }
        } catch (error) {
            console.error('Image generation failed:', error);
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: `Generování selhalo: ${error.message}`, type: 'error' }
            }));
        } finally {
            const newGeneratingState = { ...this._generatingPanels };
            delete newGeneratingState[index];
            this._generatingPanels = newGeneratingState;
            this.requestUpdate();
        }
    }

    render() {
        const script = this._getScript();
        const hasContent = script.length > 0;

        // Explicit Context Injection
        const aiContext = {
            subject: this.lesson?.subject || '',
            topic: this.lesson?.topic || '',
            title: this.lesson?.title || '',
            targetAudience: this.lesson?.targetAudience || ''
        };

        return html`
            <div data-tour="editor-comic-start" data-editor-type="comic" class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <div class="max-w-6xl mx-auto w-full space-y-6">

                        ${hasContent ? html`
                            <div class="flex justify-between items-center mb-4">
                                <div>
                                    <h2 class="text-2xl font-bold text-slate-800">${this.t('editor.comic.title')}</h2>
                                    <p class="text-slate-500 text-sm">${this.t('editor.comic.subtitle')}</p>
                                </div>
                                <button
                                    data-tour="comic-add-panel-btn"
                                    @click="${this._addPanel}"
                                    class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
                                >
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                                    ${this.t('editor.comic.add_panel')}
                                </button>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-tour="comic-panels-grid">
                                ${script.map((panel, index) => html`
                                    <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col h-[500px] relative group hover:shadow-md transition-shadow">
                                        <div class="absolute top-3 right-3 text-xs font-bold text-slate-300 pointer-events-none group-hover:text-indigo-200 z-10">
                                            PANEL ${index + 1}
                                        </div>

                                        <button
                                            @click="${() => this._deletePanel(index)}"
                                            class="absolute top-2 right-2 p-1.5 bg-white text-slate-400 hover:text-red-500 rounded-full shadow-sm border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                                            title="${this.t('common.delete')}"
                                        >
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                        </button>

                                        <!-- Image Area -->
                                        <div class="h-48 mb-3 bg-slate-100 rounded-lg overflow-hidden relative border border-slate-200">
                                            ${panel.image_url ? html`
                                                <img src="${panel.image_url}" class="w-full h-full object-cover">
                                                <button
                                                    @click="${() => this._generatePanelImage(index)}"
                                                    class="absolute bottom-2 right-2 p-1.5 bg-white/90 hover:bg-white text-indigo-600 rounded-lg shadow-sm border border-slate-200 transition-colors"
                                                    title="Pře-generovat obrázek"
                                                >
                                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                                                </button>
                                            ` : html`
                                                <div class="w-full h-full flex flex-col items-center justify-center text-slate-400">
                                                    ${this._generatingPanels[index] ? html`
                                                        <svg class="animate-spin h-8 w-8 text-indigo-500 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        <span class="text-xs font-medium">Generuji...</span>
                                                    ` : html`
                                                        <button
                                                            @click="${() => this._generatePanelImage(index)}"
                                                            class="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-colors shadow-sm flex items-center gap-1.5"
                                                        >
                                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                                            Generovat Obrázek
                                                        </button>
                                                    `}
                                                </div>
                                            `}
                                        </div>

                                        <!-- Visual Description -->
                                        <div class="flex-1 mb-3 flex flex-col">
                                            <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">${this.t('editor.comic.description_label')}</label>
                                            <textarea
                                                .value="${panel.description || ''}"
                                                @input="${e => this._handlePanelChange(index, 'description', e.target.value)}"
                                                class="flex-1 w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder-slate-300"
                                                placeholder="${this.t('editor.comic.prompt_placeholder')}"
                                            ></textarea>
                                        </div>

                                        <!-- Dialogue -->
                                        <div class="h-[120px] flex flex-col">
                                            <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">${this.t('editor.comic.dialog_label')}</label>
                                            <div class="relative flex-1">
                                                <textarea
                                                    .value="${panel.dialogue || ''}"
                                                    @input="${e => this._handlePanelChange(index, 'dialogue', e.target.value)}"
                                                    class="w-full h-full p-3 pl-4 bg-indigo-50/50 border border-indigo-100 rounded-lg rounded-tl-none text-sm text-slate-800 font-medium resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder-indigo-200"
                                                    placeholder="${this.t('editor.comic.dialog_placeholder')}"
                                                ></textarea>
                                                <!-- Speech Bubble Tail Decor -->
                                                <div class="absolute -top-2 left-0 w-4 h-4 bg-indigo-50/50 border-t border-l border-indigo-100 transform skew-y-12"></div>
                                            </div>
                                        </div>
                                    </div>
                                `)}
                            </div>

                            <div class="mt-8 pt-6 border-t border-slate-200 flex justify-center">
                                <button
                                    @click="${this._handleDiscard}"
                                    class="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium flex items-center gap-2"
                                >
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    ${this.t('common.discard_restart') !== 'common.discard_restart' ? this.t('common.discard_restart') : 'Zahodit a začít znovu'}
                                </button>
                            </div>
                        ` : html`
                            <ai-generator-panel
                                @ai-completion="${this._handleAiCompletion}"
                                .lesson="${this.lesson}"
                                .files="${this.files}"
                                .context="${aiContext}"
                                viewTitle="${this.t('editor.comic.title')}"
                                contentType="comic"
                                fieldToUpdate="comic_script"
                                description="${this.t('editor.comic.description')}"
                                .inputsConfig=${[{
                                    id: 'style',
                                    type: 'select',
                                    label: 'Styl komiksu',
                                    options: ['Manga', 'Marvel', 'Line Art', 'Pixar'],
                                    default: 'Line Art'
                                }, {
                                    id: 'panel_count',
                                    type: 'number',
                                    label: 'Počet panelů',
                                    default: 4,
                                    min: 1,
                                    max: 8
                                }]}
                            ></ai-generator-panel>
                        `}

                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-comic', EditorViewComic);
