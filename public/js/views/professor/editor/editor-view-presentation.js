// public/js/views/professor/editor/editor-view-presentation.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';
import './ai-generator-panel.js';
import './professor-header-editor.js';

export class EditorViewPresentation extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean },
        _slideCount: { state: true }
    };

    constructor() {
        super();
        this._slideCount = '5';
    }

    createRenderRoot() { return this; }

    _onSlideCountChange(e) {
        this._slideCount = e.target.value;
    }

    async _exportToPptx() {
        if (!this.lesson?.presentation?.slides) {
            alert(this.t('editor.presentation.export_error') || this.t('generate_presentation_first'));
            return;
        }

        try {
            const pres = new PptxGenJS();

            pres.defineSlideMaster({
                title: 'MASTER_SLIDE',
                background: { color: 'F1F5F9' },
                slideNumber: { x: '95%', y: '95%', color: '64748B', fontSize: 10 },
                objects: [
                    { rect: { x: 0, y: 0, w: '100%', h: 0.8, fill: { color: '4F46E5' } } },
                    { text: { text: 'AI Sensei', options: { x: 0.5, y: 0.15, w: 3, h: 0.5, fontFace: 'Arial', fontSize: 18, color: 'FFFFFF', bold: true } } }
                ]
            });

            const slides = this.lesson.presentation.slides;
            slides.forEach(slideData => {
                const slide = pres.addSlide({ masterName: 'MASTER_SLIDE' });

                slide.addText(slideData.title || this.t('editor.presentation.untitled_slide'), {
                    x: 0.5, y: 1.0, w: '90%', h: 0.8,
                    fontSize: 32, bold: true, color: '1E293B', fontFace: 'Arial'
                });

                if (slideData.points && slideData.points.length > 0) {
                    const bullets = slideData.points.map(p => ({ text: p, options: { breakLine: true } }));
                    slide.addText(bullets, {
                        x: 0.5, y: 2.0, w: '45%', h: 4.5,
                        fontSize: 18, color: '334155', bullet: true, fontFace: 'Arial', valign: 'top'
                    });
                }

                slide.addShape(pres.ShapeType.rect, {
                    x: 5.2, y: 2.0, w: 4.5, h: 3.5,
                    fill: { color: 'E2E8F0' },
                    line: { color: '94A3B8', width: 1, dashType: 'dash' }
                });

                const visualText = slideData.visual_idea
                    ? `${this.t('editor.presentation.ai_suggestion_prefix')}\n${slideData.visual_idea}`
                    : `${this.t('editor.presentation.ai_suggestion_prefix')}\n${this.t('editor.presentation.no_visual_suggestion')}`;

                slide.addText(visualText, {
                    x: 5.3, y: 2.1, w: 4.3, h: 3.3,
                    fontSize: 12, color: '64748B', fontFace: 'Arial', italic: true, valign: 'middle', align: 'center'
                });
            });

            await pres.writeFile({ fileName: `${this.lesson.title || this.t('content_types.presentation')}.pptx` });

        } catch (error) {
            console.error('Export failed:', error);
            alert(this.t('editor.presentation.export_error') + error.message);
        }
    }

    render() {
        const styleId = this.lesson?.presentation?.styleId || 'default';
        const hasContent = this.lesson?.presentation?.slides?.length > 0;
        
        return html`
            <div class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>
                <div class="flex-1 overflow-hidden relative">
                    <div class="absolute inset-0 overflow-y-auto custom-scrollbar p-6">
                        <div class="max-w-5xl mx-auto space-y-6">
                            <div class="bg-white rounded-3xl shadow-lg border border-slate-100 overflow-hidden min-h-[500px] flex flex-col relative">
                                ${hasContent ? html`
                                    <div class="absolute top-4 right-4 z-10">
                                        <button @click=${this._exportToPptx} class="px-5 py-2 font-semibold rounded-lg transition transform hover:scale-105 flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-indigo-200">
                                            💾 ${this.t('editor.download_pptx')}
                                        </button>
                                    </div>
                                ` : ''}

                                <ai-generator-panel
                                    .lesson=${this.lesson}
                                    viewTitle="${this.t('editor.presentation.ai_title')}"
                                    contentType="presentation"
                                    fieldToUpdate="presentation"
                                    description="${this.t('editor.presentation.ai_description')}"
                                    promptPlaceholder="${this.t('editor.presentation.ai_placeholder')}"
                                    .inputsConfig=${[
                                        {
                                            id: 'prompt-input-topic',
                                            type: 'text',
                                            label: this.t('editor.presentation.topic_label') || 'Téma / Klíčové body',
                                            placeholder: this.t('editor.presentation.ai_placeholder') || 'O čem má prezentace být?'
                                        },
                                        {
                                            id: 'slide_count',
                                            type: 'number',
                                            label: this.t('editor.presentation.slide_count') || 'Počet slidů',
                                            default: 5,
                                            min: 1,
                                            max: 20
                                        },
                                        {
                                            id: 'styleId',
                                            type: 'select',
                                            label: this.t('editor.presentation.style_label') || 'Styl',
                                            options: [
                                                { value: 'default', label: this.t('editor.presentation.style_default') || 'Standardní' },
                                                { value: 'modern', label: this.t('editor.presentation.style_modern') || 'Moderní' },
                                                { value: 'vibrant', label: this.t('editor.presentation.style_vibrant') || 'Živý' }
                                            ],
                                            default: styleId
                                        }
                                    ]}>
                                </ai-generator-panel>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-presentation', EditorViewPresentation);
