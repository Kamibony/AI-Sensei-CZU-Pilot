// public/js/views/professor/editor/editor-view-presentation.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import './ai-generator-panel.js';

export class EditorViewPresentation extends LitElement {
    static properties = {
        lesson: { type: Object },
        // === PRIDANÉ: Nový lokálny stav pre počet slidov ===
        _slideCount: { state: true }
    };

    constructor() {
        super();
        // === PRIDANÉ: Predvolená hodnota ===
        this._slideCount = 5;
    }

    createRenderRoot() { return this; }

    // === PRIDANÉ: Funkcia, ktorá sa spustí pri zmene inputu ===
    _onSlideCountChange(e) {
        this._slideCount = e.target.value;
    }

    render() {
        const styleId = this.lesson?.presentation?.styleId || 'default';
        
        // Poznámka: Keď sa komponent prekreslí, .value=${this._slideCount}
        // zabezpečí, že sa tam vloží "8" (alebo akákoľvek posledná hodnota)
        // a nie natvrdo "5".
        
        return html`
            <ai-generator-panel
                .lesson=${this.lesson}
                viewTitle="AI Prezentace"
                contentType="presentation"
                fieldToUpdate="presentation"
                description="Zadejte téma a počet slidů. Můžete vybrat dokumenty (RAG)."
                promptPlaceholder="Např. Klíčové momenty Římské republiky">
                
                <div slot="ai-inputs" class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div class="md:col-span-2">
                        </div>
                    <div>
                        <label class="block font-medium text-slate-600">Počet slidů</label>
                        <input id="slide-count-input" 
                               type="number" 
                               class="w-full border-slate-300 rounded-lg p-2 mt-1" 
                               .value=${this._slideCount}
                               @input=${this._onSlideCountChange}>
                    </div>
                </div>
                <div slot="ai-inputs" class="mb-4">
                    <label for="presentation-style-selector" class="block text-sm font-medium text-gray-700 mb-1">Styl prezentace:</label>
                    <select id="presentation-style-selector" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md .value=${styleId}">
                        <option value="default">Výchozí (Zelená)</option>
                        <option value="modern">Moderní (Modrá)</option>
                        <option value="vibrant">Živý (Oranžová)</option>
                    </select>
                </div>
            </ai-generator-panel>
        `;
    }
}
customElements.define('editor-view-presentation', EditorViewPresentation);
