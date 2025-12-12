import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { callGenerateImage } from '../../../gemini-api.js';
import { showToast } from '../../../utils.js';
import { parseAiResponse } from './utils-parsing.mjs';
import './professor-header-editor.js';
import './ai-generator-panel.js';

export class EditorViewComic extends LitElement {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean },
        _panels: { state: true, type: Array },
        _isGeneratingImage: { state: true, type: Number }, // Store index of generating panel
    };

    constructor() {
        super();
        this.lesson = null;
        this._panels = [];
        this._isGeneratingImage = -1; // -1 means no panel is generating
    }

    createRenderRoot() {
        return this;
    }

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson') && this.lesson) {
            let panels = [];

            // 1. Try to parse 'comic' property (full object with images)
            const rawComic = parseAiResponse(this.lesson.comic, 'panels');
            if (rawComic.length > 0) {
                panels = rawComic.map(p => ({
                    panel: p.panel_number || p.panel,
                    description: p.visual_description || p.description,
                    dialogue: p.dialogue,
                    imageBase64: p.imageBase64 || null
                }));
            }

            // 2. Fallback to 'comic_script' if main comic empty (just script from AI)
            if (panels.length === 0 && this.lesson.comic_script) {
                const rawScript = parseAiResponse(this.lesson.comic_script, 'panels');
                if (rawScript.length > 0) {
                    panels = rawScript.map(p => ({
                        panel: p.panel_number || p.panel,
                        description: p.visual_description || p.description,
                        dialogue: p.dialogue,
                        imageBase64: null
                    }));
                }
            }

            // 3. Update state if we found panels
            if (panels.length > 0) {
                 this._panels = panels;
            }
            // If still empty, we don't initialize default array yet, so we can show the AI/Start screen
        }
    }

    _initEmptyPanels() {
        this._panels = Array(4).fill().map((_, i) => ({
            panel: i + 1,
            description: '',
            dialogue: '',
            imageBase64: null
        }));
        this.requestUpdate();
    }

    _handleInputChange(e, index, field) {
        const newValue = e.target.value;
        this._panels[index][field] = newValue;
        this.requestUpdate('_panels');
    }

    async _generatePanelImage(index) {
        if (this._isGeneratingImage !== -1) {
            showToast("Už se generuje jiný panel.", true);
            return;
        }

        const panel = this._panels[index];
        if (!panel.description) {
            showToast("Vizuální popis nemůže být prázdný.", true);
            return;
        }

        this._isGeneratingImage = index;

        try {
            const result = await callGenerateImage(panel.description);

            if (result && result.imageBase64) {
                this._panels[index].imageBase64 = result.imageBase64;
                this.requestUpdate('_panels'); // This triggers a re-render
                showToast(`Obrázek pro panel ${index + 1} byl vygenerován.`);
            } else {
                 throw new Error(result.error || "No image data received from function.");
            }
        } catch (error) {
            console.error("Error generating image:", error);
            showToast(`Chyba při generování obrázku: ${error.message}`, true);
        } finally {
            this._isGeneratingImage = -1;
        }
    }

    save() {
        const updatedLesson = {
            ...this.lesson,
            comic: this._panels,
            // Also save the script itself for future reference
            comic_script: {
                panels: this._panels.map(p => ({
                    panel_number: p.panel,
                    visual_description: p.description,
                    dialogue: p.dialogue
                }))
            }
        };

        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: updatedLesson,
            bubbles: true,
            composed: true
        }));
    }

    render() {
        const hasScript = this._panels && this._panels.length > 0 && this._panels.some(p => p.description || p.dialogue);

        return html`
            <div class="h-full bg-slate-50 overflow-y-auto p-4 md:p-8">
                <div class="max-w-5xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden min-h-[800px] flex flex-col">
                    <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                    <div class="flex-1 p-6 md:p-8">
                         ${!hasScript ? html`
                            <div class="flex flex-col h-full">
                                <ai-generator-panel
                                    .lesson="${this.lesson}"
                                    contentType="comic"
                                    fieldToUpdate="comic_script"
                                    viewTitle="Generátor Komiksu"
                                    promptPlaceholder="Např.: Rozhovor dvou atomů o vazbách..."
                                    description="Nechte AI vytvořit scénář pro váš komiks, nebo začněte rovnou tvořit."
                                    .files="${this.lesson?.ragFilePaths || []}"
                                ></ai-generator-panel>

                                <div class="mt-8 text-center pt-8 border-t border-slate-100">
                                    <button @click="${this._initEmptyPanels}" class="text-slate-400 hover:text-slate-600 text-sm font-medium transition-colors">
                                        Nebo začít s prázdným komiksem (Ručně)
                                    </button>
                                </div>
                            </div>
                         ` : html`
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                                ${this._panels.map((panel, index) => html`
                                    <div class="bg-white rounded-2xl border-2 border-slate-100 p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4 relative group">
                                         <div class="absolute -top-3 -left-3 w-8 h-8 bg-slate-800 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-lg z-10">
                                            ${index + 1}
                                         </div>

                                         <!-- Image Area -->
                                         <div class="aspect-square bg-slate-50 rounded-xl border border-slate-100 overflow-hidden relative group-hover:border-indigo-100 transition-colors">
                                              ${panel.imageBase64 ? html`
                                                  <img src="data:image/png;base64,${panel.imageBase64}" class="w-full h-full object-cover">
                                              ` : html`
                                                  <div class="w-full h-full flex flex-col items-center justify-center text-slate-300">
                                                      <span class="text-4xl mb-2">🖼️</span>
                                                      <span class="text-xs font-medium">Zatím bez obrázku</span>
                                                  </div>
                                              `}

                                              <!-- Generate Btn -->
                                              <button
                                                  @click="${() => this._generatePanelImage(index)}"
                                                  ?disabled=${this._isGeneratingImage !== -1}
                                                  class="absolute bottom-2 right-2 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                                                  title="Vygenerovat obrázek"
                                              >
                                                  ${this._isGeneratingImage === index
                                                    ? html`<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>`
                                                    : html`<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`
                                                  }
                                              </button>
                                         </div>

                                         <!-- Text Areas -->
                                         <div class="space-y-3">
                                             <div>
                                                 <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Scéna (Prompt pro AI)</label>
                                                 <textarea
                                                    .value="${panel.description}"
                                                    @change="${e => this._handleInputChange(e, index, 'description')}"
                                                    class="w-full text-xs text-slate-600 bg-slate-50 border-0 rounded-lg p-2 resize-none focus:ring-1 focus:ring-indigo-500 min-h-[60px]"
                                                    placeholder="Popis scény..."
                                                 ></textarea>
                                             </div>
                                             <div>
                                                 <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Dialog</label>
                                                 <textarea
                                                    .value="${panel.dialogue}"
                                                    @change="${e => this._handleInputChange(e, index, 'dialogue')}"
                                                    class="w-full text-sm font-medium text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
                                                    rows="3"
                                                    placeholder="Co postavy říkají?"
                                                 ></textarea>
                                             </div>
                                         </div>
                                    </div>
                                `)}
                            </div>
                             <div class="mt-8 flex justify-end pb-8 border-t border-slate-100 pt-8">
                                <button @click=${this.save} class="bg-slate-900 text-white px-8 py-3 rounded-full font-bold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all">
                                    Uložit komiks
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
