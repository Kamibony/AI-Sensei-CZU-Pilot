// public/js/views/professor/editor/editor-view-presentation.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { translationService } from '../../../utils/translation-service.js';
import './ai-generator-panel.js';

export class EditorViewPresentation extends LitElement {
    static properties = {
        lesson: { type: Object },
        // === PRIDANÉ: Nový lokálny stav pre počet slidov ===
        _slideCount: { state: true }
    };

    constructor() {
        super();
        // === ZMENENÉ: Predvolená hodnota, ktorú si komponent pamätá ===
        this._slideCount = '5'; // Stále tu bude 5, ale už si to bude pamätať
    }

    createRenderRoot() { return this; }

    // === PRIDANÉ: Funkcia, ktorá sa spustí pri zmene inputu ===
    _onSlideCountChange(e) {
        // Uložíme si, čo používateľ napísal (napr. "8")
        this._slideCount = e.target.value;
    }

    async _exportToPptx() {
        if (!this.lesson?.presentation?.slides) {
            alert(translationService.t('editor.generate_presentation_first') || 'Nejprve vygenerujte prezentaci.');
            return;
        }

        try {
            // 1. Initialize PptxGenJS
            const pres = new PptxGenJS();

            // 2. Define Master Slide (AI Sensei branding)
            pres.defineSlideMaster({
                title: 'MASTER_SLIDE',
                background: { color: 'F1F5F9' }, // slate-100
                slideNumber: { x: '95%', y: '95%', color: '64748B', fontSize: 10 },
                objects: [
                    { rect: { x: 0, y: 0, w: '100%', h: 0.8, fill: { color: '4F46E5' } } }, // Indigo header bar
                    { text: { text: 'AI Sensei', options: { x: 0.5, y: 0.15, w: 3, h: 0.5, fontFace: 'Arial', fontSize: 18, color: 'FFFFFF', bold: true } } }
                ]
            });

            // 3. Loop through slides
            const slides = this.lesson.presentation.slides;
            slides.forEach(slideData => {
                const slide = pres.addSlide({ masterName: 'MASTER_SLIDE' });

                // Title
                slide.addText(slideData.title || 'Bez názvu', {
                    x: 0.5, y: 1.0, w: '90%', h: 0.8,
                    fontSize: 32, bold: true, color: '1E293B', fontFace: 'Arial'
                });

                // Points (Bullet points - Left side)
                if (slideData.points && slideData.points.length > 0) {
                    const bullets = slideData.points.map(p => ({ text: p, options: { breakLine: true } }));
                    slide.addText(bullets, {
                        x: 0.5, y: 2.0, w: '45%', h: 4.5,
                        fontSize: 18, color: '334155', bullet: true, fontFace: 'Arial', valign: 'top'
                    });
                }

                // Visual Placeholder (Right side)
                // Distinct placeholder box on the Right side
                slide.addShape(pres.ShapeType.rect, {
                    x: 5.2, y: 2.0, w: 4.5, h: 3.5,
                    fill: { color: 'E2E8F0' }, // light gray slate-200
                    line: { color: '94A3B8', width: 1, dashType: 'dash' }
                });

                const visualText = slideData.visual_idea
                    ? `🖼️ AI Suggestion:\n${slideData.visual_idea}`
                    : "🖼️ AI Suggestion:\n(No visual suggestion)";

                slide.addText(visualText, {
                    x: 5.3, y: 2.1, w: 4.3, h: 3.3,
                    fontSize: 12, color: '64748B', fontFace: 'Arial', italic: true, valign: 'middle', align: 'center'
                });
            });

            // 4. Save
            await pres.writeFile({ fileName: `${this.lesson.title || 'Prezentace'}.pptx` });

        } catch (error) {
            console.error('Export failed:', error);
            alert('Chyba při exportu do PPTX: ' + error.message);
        }
    }

    render() {
        const styleId = this.lesson?.presentation?.styleId || 'default';
        const hasContent = this.lesson?.presentation?.slides?.length > 0;
        
        return html`
            <div class="relative">
                ${hasContent ? html`
                    <div class="absolute top-24 right-8 z-10">
                        <button @click=${this._exportToPptx} class="px-5 py-2 font-semibold rounded-lg transition transform hover:scale-105 flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-indigo-200">
                            💾 ${translationService.t('editor.download_pptx') || 'Stáhnout PPTX'}
                        </button>
                    </div>
                ` : ''}

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
            </div>
        `;
    }
}
customElements.define('editor-view-presentation', EditorViewPresentation);
