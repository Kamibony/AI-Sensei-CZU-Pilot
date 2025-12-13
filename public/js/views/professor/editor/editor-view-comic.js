import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';
import './professor-header-editor.js';
import './ai-generator-panel.js';

export class EditorViewComic extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean },
        _panels: { state: true, type: Array } // Array of { image_prompt: string, text: string }
    };

    constructor() {
        super();
        this.lesson = null;
        this._panels = Array(4).fill({ image_prompt: '', text: '' });
    }

    createRenderRoot() { return this; }

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson')) {
            const data = this.lesson?.comic;
            if (Array.isArray(data) && data.length > 0) {
                // Ensure we always have 4 panels for the grid layout
                this._panels = data.slice(0, 4);
                while (this._panels.length < 4) {
                    this._panels.push({ image_prompt: '', text: '' });
                }
            } else if (!data) {
                // Reset to empty if no data
                 this._panels = Array(4).fill({ image_prompt: '', text: '' });
            }
            // If still empty, we don't initialize default array yet, so we can show the AI/Start screen
        }
    }

    save() {
        // Filter out completely empty panels to save space, but maybe we want to keep structure?
        // Let's keep the structure as arrays of objects are expected.
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: { comic: this._panels },
            bubbles: true,
            composed: true
        }));
    }

    _updatePanel(index, field, value) {
        const newPanels = [...this._panels];
        newPanels[index] = { ...newPanels[index], [field]: value };
        this._panels = newPanels;
        this.save();
    }

    _renderPanel(panel, index) {
        return html`
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col h-[320px] relative group hover:shadow-md transition-shadow">
                <div class="absolute top-3 right-3 text-xs font-bold text-slate-300 pointer-events-none group-hover:text-indigo-200">
                    PANEL ${index + 1}
                </div>

                <!-- Scene Description (Top Half) -->
                <div class="flex-1 mb-3 flex flex-col">
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">${this.t('editor.comic.panel_label')}</label>
                    <textarea
                        .value="${panel.image_prompt || ''}"
                        @input="${e => this._updatePanel(index, 'image_prompt', e.target.value)}"
                        class="flex-1 w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder-slate-300"
                        placeholder="${this.t('editor.comic.prompt_placeholder')}"
                    ></textarea>
                </div>

                <!-- Dialogue (Bottom Half) -->
                <div class="h-[100px] flex flex-col">
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">${this.t('editor.comic.dialog_label')}</label>
                    <div class="relative flex-1">
                        <textarea
                            .value="${panel.text || ''}"
                            @input="${e => this._updatePanel(index, 'text', e.target.value)}"
                            class="w-full h-full p-3 pl-4 bg-indigo-50/50 border border-indigo-100 rounded-lg rounded-tl-none text-sm text-slate-800 font-medium resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder-indigo-200"
                            placeholder="${this.t('editor.comic.dialog_placeholder')}"
                        ></textarea>
                         <!-- Speech Bubble Tail Decor -->
                        <div class="absolute -top-2 left-0 w-4 h-4 bg-indigo-50/50 border-t border-l border-indigo-100 transform skew-y-12"></div>
                    </div>
                </div>
            </div>
        `;
    }

    _switchToManual() {
        // Just ensures panels are initialized, which they are by default in constructor
        this._panels = Array(4).fill({ image_prompt: '', text: '' });
        // Force update just in case
        this.requestUpdate();
    }

    render() {
        const isEmpty = this._panels.every(p => !p.image_prompt && !p.text);

        return html`
            <div class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <div class="max-w-5xl mx-auto w-full space-y-6">

                         <!-- Header -->
                        <div class="mb-4">
                            <h2 class="text-2xl font-bold text-slate-800">${this.t('editor.comic.title')}</h2>
                            <p class="text-slate-500 text-sm">${this.t('editor.comic.subtitle')}</p>
                        </div>

                        ${isEmpty ? html`
                            <!-- Magic / Empty State -->
                            <div class="space-y-6">
                                <ai-generator-panel
                                    .lesson="${this.lesson}"
                                    .files="${this.lesson?.ragFilePaths || []}"
                                    viewTitle="${this.t('editor.comic.ai_title')}"
                                    contentType="comic"
                                    fieldToUpdate="comic"
                                    description="${this.t('editor.comic.ai_description')}"
                                    promptPlaceholder="${this.t('editor.comic.ai_placeholder')}"
                                ></ai-generator-panel>

                                <div class="text-center pt-8 border-t border-slate-200">
                                     <button
                                        @click="${this._switchToManual}"
                                        class="px-5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm text-sm"
                                    >
                                        ✍️ ${this.t('editor.comic.empty_btn')}
                                    </button>
                                </div>
                            </div>
                        ` : html`
                            <!-- 2x2 Grid Editor -->
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                ${this._panels.map((panel, index) => this._renderPanel(panel, index))}
                            </div>

                            <div class="flex justify-end pt-4">
                                 <button
                                    @click="${() => { if(confirm(this.t('editor.comic.confirm_delete'))) { this._panels = Array(4).fill({ image_prompt: '', text: '' }); this.save(); } }}"
                                    class="text-xs text-red-500 hover:text-red-700 hover:underline"
                                >
                                    ${this.t('editor.comic.delete_all')}
                                </button>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-comic', EditorViewComic);
