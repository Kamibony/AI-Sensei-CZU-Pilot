import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';
import './professor-header-editor.js';
import './ai-generator-panel.js';

export class EditorViewComic extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean }
    };

    createRenderRoot() { return this; }

    _updateScript(newScript) {
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: { comic_script: newScript },
            bubbles: true,
            composed: true
        }));
    }

    _handlePanelChange(index, field, value) {
        const script = [...(this.lesson.comic_script || [])];
        script[index] = { ...script[index], [field]: value };
        this._updateScript(script);
    }

    _addPanel() {
        const script = [...(this.lesson.comic_script || [])];
        script.push({
            panel_number: script.length + 1,
            description: '',
            dialogue: ''
        });
        this._updateScript(script);
    }

    _deletePanel(index) {
        const script = [...(this.lesson.comic_script || [])];
        script.splice(index, 1);
        // Re-number panels
        const renumbered = script.map((panel, i) => ({ ...panel, panel_number: i + 1 }));
        this._updateScript(renumbered);
    }

    render() {
        const script = this.lesson?.comic_script || [];
        const hasContent = Array.isArray(script) && script.length > 0;

        return html`
            <div class="h-full flex flex-col bg-slate-50 relative">
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
                                    @click="${this._addPanel}"
                                    class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
                                >
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                                    ${this.t('editor.comic.add_panel')}
                                </button>
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                ${script.map((panel, index) => html`
                                    <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col h-[360px] relative group hover:shadow-md transition-shadow">
                                        <div class="absolute top-3 right-3 text-xs font-bold text-slate-300 pointer-events-none group-hover:text-indigo-200">
                                            PANEL ${index + 1}
                                        </div>

                                        <button
                                            @click="${() => this._deletePanel(index)}"
                                            class="absolute top-2 right-2 p-1.5 bg-white text-slate-400 hover:text-red-500 rounded-full shadow-sm border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                            title="${this.t('common.delete')}"
                                        >
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                        </button>

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
                        ` : html`
                            <ai-generator-panel
                                .lesson="${this.lesson}"
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
