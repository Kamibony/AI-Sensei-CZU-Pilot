import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import * as firebaseInit from '../../../firebase-init.js';
import { showToast } from '../../../utils.js';

export class EditorViewComic extends LitElement {
    static properties = {
        lesson: { type: Object },
        _panels: { state: true, type: Array },
        _isGeneratingImage: { state: true, type: Number }, // Store index of generating panel
        _isGeneratingScript: { state: true, type: Boolean },
        _scriptPrompt: { state: true, type: String }
    };

    constructor() {
        super();
        this.lesson = null;
        this._panels = [];
        this._isGeneratingImage = -1; // -1 means no panel is generating
        this._isGeneratingScript = false;
        this._scriptPrompt = '';
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        // Initialize panels from lesson data or create a default structure
        if (this.lesson && this.lesson.comic && Array.isArray(this.lesson.comic)) {
            this._panels = this.lesson.comic;
        } else {
            // Default to 4 empty panels if no data exists
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

    async _generateScript() {
        if (!this._scriptPrompt.trim()) {
            showToast("Zadejte prosím téma nebo instrukce pro AI.", true);
            return;
        }

        this._isGeneratingScript = true;
        try {
            const generateContent = httpsCallable(firebaseInit.functions, 'generateContent');

            // Collect file paths from lesson if available (for RAG)
            const filePaths = this.lesson?.files?.map(f => f.storagePath) || [];

            const result = await generateContent({
                contentType: 'comic',
                promptData: { userPrompt: this._scriptPrompt },
                filePaths: filePaths
            });

            if (result.data && result.data.comic) {
                // Merge generated data with existing panels (preserving images if any, though usually this is a fresh start)
                // Or just replace text content
                const generatedPanels = result.data.comic;

                this._panels = this._panels.map((panel, index) => {
                    const genPanel = generatedPanels.find(p => p.panel === index + 1);
                    if (genPanel) {
                        return {
                            ...panel,
                            description: genPanel.description,
                            dialogue: genPanel.dialogue
                        };
                    }
                    return panel;
                });

                showToast("Scénář byl úspěšně vygenerován!");
            } else {
                throw new Error("Invalid response from AI");
            }

        } catch (error) {
            console.error("Error generating script:", error);
            showToast("Chyba při generování scénáře: " + error.message, true);
        } finally {
            this._isGeneratingScript = false;
        }
    }

    async _generatePanelImage(index) {
        if (this._isGeneratingImage !== -1) {
            showToast("Už se generuje jiný panel.", true);
            return;
        }

        const panel = this._panels[index];
        if (!panel.description) {
            showToast("Popis scény nemůže být prázdný.", true);
            return;
        }

        this._isGeneratingImage = index;

        try {
            const generateImage = httpsCallable(firebaseInit.functions, 'generateImage');
            const result = await generateImage({ prompt: panel.description });

            if (result.data && result.data.imageBase64) {
                this._panels[index].imageBase64 = result.data.imageBase64;
                this.requestUpdate('_panels');
                showToast(`Obrázek pro panel ${index + 1} byl vygenerován.`);
            } else {
                throw new Error("No image data received from function.");
            }
        } catch (error) {
            console.error("Error generating image:", error);
            showToast("Chyba při generování obrázku.", true);
        } finally {
            this._isGeneratingImage = -1;
        }
    }

    save() {
        const updatedLesson = {
            ...this.lesson,
            comic: this._panels
        };

        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: updatedLesson,
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
            <div class="p-8 max-w-7xl mx-auto">
                <div class="flex items-center justify-between mb-8">
                    <div>
                        <h2 class="text-3xl font-bold text-slate-900 tracking-tight">Komiksový Editor</h2>
                        <p class="text-slate-500 mt-1">Vytvořte vzdělávací komiks pomocí AI.</p>
                    </div>
                    <button @click=${this.save} class="text-sm font-bold text-white bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl transition-all shadow-lg shadow-green-500/20 hover:shadow-green-500/40 hover:-translate-y-0.5 flex items-center">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                        Uložit komiks
                    </button>
                </div>

                <!-- AI Script Generator Section -->
                <div class="bg-indigo-50 rounded-2xl p-6 border border-indigo-100 mb-8">
                    <h3 class="font-bold text-indigo-900 mb-3 flex items-center">
                        <span class="text-xl mr-2">✨</span> Generátor Scénáře
                    </h3>
                    <div class="flex gap-4">
                        <input 
                            type="text" 
                            .value=${this._scriptPrompt}
                            @input=${e => this._scriptPrompt = e.target.value}
                            placeholder="O čem má komiks být? Např. 'Vysvětli fotosyntézu vtipným způsobem'..."
                            class="flex-1 p-3 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        >
                        <button 
                            @click=${this._generateScript}
                            ?disabled=${this._isGeneratingScript}
                            class="bg-indigo-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center whitespace-nowrap"
                        >
                            ${this._isGeneratingScript
                ? html`<span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span> Přemýšlím...`
                : 'Generovat scénář'}
                        </button>
                    </div>
                    <p class="text-xs text-indigo-400 mt-2 ml-1">
                        <span class="font-bold">Tip:</span> Pokud má lekce nahrané PDF soubory, AI je použije pro přesnější obsah.
                    </p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    ${this._panels.map((panel, index) => html`
                        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-6 flex flex-col space-y-4">
                            <div class="flex justify-between items-center border-b border-slate-100 pb-3">
                                <h3 class="font-bold text-slate-700">Panel ${index + 1}</h3>
                                <span class="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded">#${index + 1}</span>
                            </div>

                            <!-- Visual Description -->
                            <div>
                                <label class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Vizuální popis (pro AI)</label>
                                <textarea
                                    class="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none bg-slate-50 focus:bg-white"
                                    rows="3"
                                    .value=${panel.description || ''}
                                    @input=${e => this._handleInputChange(e, index, 'description')}
                                    placeholder="Popište scénu anglicky pro nejlepší výsledek..."
                                ></textarea>
                            </div>

                            <!-- Dialogue -->
                            <div>
                                <label class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Dialog</label>
                                <textarea
                                    class="w-full p-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none bg-slate-50 focus:bg-white"
                                    rows="2"
                                    .value=${panel.dialogue || ''}
                                    @input=${e => this._handleInputChange(e, index, 'dialogue')}
                                    placeholder="Co postavy říkají..."
                                ></textarea>
                            </div>

                            <!-- Image Preview -->
                            <div class="aspect-square bg-slate-100 rounded-xl flex items-center justify-center overflow-hidden border-2 border-dashed border-slate-200 relative group">
                                ${panel.imageBase64
                        ? html`
                                        <img src="data:image/png;base64,${panel.imageBase64}" alt="Panel ${index + 1}" class="object-cover w-full h-full">
                                        <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <button @click=${() => this._generatePanelImage(index)} class="bg-white text-slate-900 font-bold py-2 px-4 rounded-lg hover:scale-105 transition-transform">
                                                Přegenerovat
                                            </button>
                                        </div>
                                    `
                        : html`
                                        <div class="text-center p-4">
                                            <span class="text-4xl block mb-2">🖼️</span>
                                            <span class="text-slate-400 text-sm">Zatím bez obrázku</span>
                                        </div>
                                    `
                    }
                            </div>

                            <!-- Action Button (only if no image) -->
                            ${!panel.imageBase64 ? html`
                                <button
                                    @click=${() => this._generatePanelImage(index)}
                                    ?disabled=${this._isGeneratingImage !== -1}
                                    class="w-full py-3 px-4 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-indigo-200"
                                >
                                    ${this._isGeneratingImage === index
                            ? html`<span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span> Generuji...`
                            : html`🎨 Vygenerovat obrázek`
                        }
                                </button>
                            ` : nothing}
                        </div>
                    `)}
                </div>
            </div>
        `;
    }
}

customElements.define('editor-view-comic', EditorViewComic);
