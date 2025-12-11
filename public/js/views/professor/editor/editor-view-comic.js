import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { callGenerateContent, callGenerateImage } from '../../../gemini-api.js';
import { showToast } from '../../../utils.js';
import { parseAiResponse } from './utils-parsing.mjs';
import './professor-header-editor.js';

export class EditorViewComic extends LitElement {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean },
        _panels: { state: true, type: Array },
        _isGeneratingImage: { state: true, type: Number }, // Store index of generating panel
        _isGeneratingScript: { state: true, type: Boolean },
    };

    constructor() {
        super();
        this.lesson = null;
        this._panels = [];
        this._isGeneratingImage = -1; // -1 means no panel is generating
        this._isGeneratingScript = false;
    }

    createRenderRoot() {
        return this;
    }

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson') && this.lesson) {
            let panels = [];

            // 1. Try to parse 'comic' property
            const rawComic = parseAiResponse(this.lesson.comic, 'panels');
            if (rawComic.length > 0) {
                panels = rawComic.map(p => ({
                    panel: p.panel_number || p.panel,
                    description: p.visual_description || p.description,
                    dialogue: p.dialogue,
                    imageBase64: p.imageBase64 || null
                }));
            }

            // 2. Fallback to 'comic_script' if main comic empty
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
            } else if (this._panels.length === 0) {
                 // Initialize empty if nothing found and state is empty
                 this._panels = Array(4).fill().map((_, i) => ({
                    panel: i + 1,
                    description: '',
                    dialogue: '',
                    imageBase64: null
                }));
            }
        }
    }

    connectedCallback() {
        super.connectedCallback();
        // Initial setup logic moved to willUpdate for better reactivity
        // But if lesson is already set before connectedCallback, willUpdate runs.
        // If not set yet, it runs when set.
        if (this._panels.length === 0) {
             this._panels = Array(4).fill().map((_, i) => ({
                panel: i + 1,
                description: '',
                dialogue: '',
                imageBase64: null
            }));
        }
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

    async _generateScript() {
        this._isGeneratingScript = true;
        try {
            const prompt = `Vytvoř vtipný scénář pro 4-panelový vzdělávací komiks k tématu: ${this.lesson.title}. Výstup musí být POUZE validní JSON v tomto formátu: { "panels": [ { "panel_number": 1, "visual_description": "...", "dialogue": "..." }, ... ] }`;
            const result = await callGenerateContent({
                contentType: 'comic',
                promptData: { userPrompt: prompt },
                filePaths: []
            });

            if (result && result.text && !result.error) {
                 // Use Smart Parsing
                const panels = parseAiResponse(result.text, 'panels');

                if (panels.length > 0) {
                     this._panels = panels.map(p => ({
                        panel: p.panel_number || p.panel,
                        description: p.visual_description || p.description,
                        dialogue: p.dialogue,
                        imageBase64: null
                    }));
                    this.requestUpdate('_panels');
                    this.save(); // Autosave
                    showToast("Scénář byl úspěšně vygenerován.");
                } else {
                    throw new Error("AI did not return a valid JSON object or panels array.");
                }
            } else {
                throw new Error(result.error || "No valid response from AI.");
            }
        } catch (error) {
            console.error("Error generating comic script:", error);
            showToast(`Chyba při generování scénáře: ${error.message}`, true);
        } finally {
            this._isGeneratingScript = false;
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
            <div class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>
                <div class="flex-1 overflow-hidden relative">
                    <div class="absolute inset-0 overflow-y-auto custom-scrollbar p-8">
                        <div class="max-w-7xl mx-auto">
                            <h2 class="text-2xl font-bold text-slate-800 mb-6 text-center">Komiksový Editor</h2>

                            ${!hasScript ? html`
                                <div class="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
                                    <span class="text-5xl mb-4">📝</span>
                                    <h3 class="text-xl font-bold text-slate-700">Zatím zde není žádný scénář.</h3>
                                    <p class="text-slate-500 mb-6">Nechte AI, aby vám pomohla s kreativním procesem.</p>
                                    <button
                                        @click=${this._generateScript}
                                        ?disabled=${this._isGeneratingScript}
                                        class="py-3 px-6 rounded-lg bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all hover:-translate-y-0.5 disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center justify-center"
                                    >
                                        ${this._isGeneratingScript
                                            ? html`<span class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-3"></span> Generuji...`
                                            : html`✨ Vygenerovat scénář pomocí AI`
                                        }
                                    </button>
                                </div>
                            ` : html`
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    ${this._panels.map((panel, index) => html`
                                        <div class="bg-slate-50 rounded-2xl border border-slate-200 p-6 flex flex-col space-y-4">
                                            <h3 class="font-bold text-slate-700">Panel ${index + 1}</h3>

                                            <!-- Visual Description -->
                                            <div>
                                                <label class="text-sm font-medium text-slate-600">Vizuální popis</label>
                                                <textarea
                                                    class="w-full mt-1 p-2 border border-slate-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                    rows="3"
                                                    .value=${panel.description || ''}
                                                    @input=${e => this._handleInputChange(e, index, 'description')}
                                                ></textarea>
                                            </div>

                                            <!-- Dialogue -->
                                            <div>
                                                <label class="text-sm font-medium text-slate-600">Dialog</label>
                                                <textarea
                                                    class="w-full mt-1 p-2 border border-slate-300 rounded-lg text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                    rows="2"
                                                    .value=${panel.dialogue || ''}
                                                    @input=${e => this._handleInputChange(e, index, 'dialogue')}
                                                ></textarea>
                                            </div>

                                            <!-- Image Preview -->
                                            <div class="aspect-square bg-slate-200 rounded-lg flex items-center justify-center overflow-hidden">
                                                ${panel.imageBase64
                                                    ? html`<img src="data:image/png;base64,${panel.imageBase64}" alt="Panel ${index + 1}" class="object-cover w-full h-full">`
                                                    : html`<span class="text-slate-500 text-2xl">🖼️ Žádný obrázek</span>`
                                                }
                                            </div>

                                            <!-- Action Button -->
                                            <button
                                                @click=${() => this._generatePanelImage(index)}
                                                ?disabled=${this._isGeneratingImage !== -1}
                                                class="w-full py-2 px-4 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center justify-center"
                                            >
                                                ${this._isGeneratingImage === index
                                                    ? html`<span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span> Generuji...`
                                                    : html`🎨 Vygenerovat obrázek`
                                                }
                                            </button>
                                        </div>
                                    `)}
                                </div>
                            `}

                            <div class="mt-8 flex justify-end">
                                <button @click=${this.save} class="text-sm font-bold text-white bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl transition-all shadow-lg shadow-green-500/20 hover:shadow-green-500/40 hover:-translate-y-0.5 flex items-center">
                                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                                    Uložit komiks
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('editor-view-comic', EditorViewComic);
