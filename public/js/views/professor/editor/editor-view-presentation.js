// public/js/views/professor/editor/editor-view-presentation.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';
import './ai-generator-panel.js';
import './professor-header-editor.js';

export class EditorViewPresentation extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean },
        files: { type: Array },
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

    // --- Phase 2: Editor Standardization ---
    _handleAiCompletion(e) {
        const data = e.detail.data;
        if (!data) return;

        // 1. Normalize
        let slides = [];
        // Robust handling of polymorphic AI return types
        if (typeof data === 'object') {
             if (Array.isArray(data.slides)) {
                 slides = data.slides;
             } else if (Array.isArray(data)) {
                 slides = data;
             } else if (data.content || data.text) {
                 // Phase 4: Auto-convert text to single slide
                 slides = [{
                     title: this.t('editor.presentation.generated_slide') || "AI Slide",
                     points: [(data.content || data.text).substring(0, 200) + "..."],
                     content: data.content || data.text,
                     visual_idea: "Text summary"
                 }];
             }
        } else if (typeof data === 'string') {
             try {
                 const parsed = JSON.parse(data);
                 if (parsed.slides && Array.isArray(parsed.slides)) slides = parsed.slides;
                 else if (Array.isArray(parsed)) slides = parsed;
             } catch (err) {
                 // Fallback: Raw text to slide
                 slides = [{
                     title: "AI Result",
                     points: [data.substring(0, 100) + "..."],
                     content: data,
                     visual_idea: "Text summary"
                 }];
             }
        }

        // 3. Assign & 4. Save
        if (slides.length > 0) {
            // Update local state first
            if (!this.lesson.presentation) this.lesson.presentation = {};
            this.lesson.presentation.slides = slides;

            // CRITICAL: Dispatch update immediately
            this._dispatchUpdate(slides);

            // 5. Refresh
            this.requestUpdate();
        }
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
                } else if (slideData.content) {
                     slide.addText(slideData.content, {
                        x: 0.5, y: 2.0, w: '45%', h: 4.5,
                        fontSize: 18, color: '334155', fontFace: 'Arial', valign: 'top'
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

    _getSlides() {
        let slides = [];
        const raw = this.lesson?.presentation;

        // Defensive Normalization
        if (raw) {
            if (typeof raw === 'string') {
                try {
                    const parsed = JSON.parse(raw);
                    slides = parsed.slides || (Array.isArray(parsed) ? parsed : []);
                } catch (e) { console.warn("Failed to parse presentation", e); }
            } else if (Array.isArray(raw.slides)) {
                slides = raw.slides;
            } else if (Array.isArray(raw)) {
                slides = raw;
            }
        }

        return JSON.parse(JSON.stringify(slides));
    }

    _dispatchUpdate(slides) {
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: {
                presentation: { ...this.lesson.presentation, slides: slides }
            },
            bubbles: true,
            composed: true
        }));
    }

    _handleSlideChange(index, field, value) {
        const slides = this._getSlides();
        if (slides[index]) {
            if (field === 'points') {
                // Split by newline if editing points as text area
                slides[index][field] = value.split('\n');
            } else {
                slides[index][field] = value;
            }
            this._dispatchUpdate(slides);
        }
    }

    _addSlide() {
        const slides = this._getSlides();
        slides.push({
            title: this.t('editor.presentation.new_slide_title') || 'Nový Slide',
            points: [],
            content: '',
            visual_idea: ''
        });
        this._dispatchUpdate(slides);
    }

    _removeSlide(index) {
        const slides = this._getSlides();
        slides.splice(index, 1);
        this._dispatchUpdate(slides);
    }

    render() {
        // Robust data access using helper
        const slides = this._getSlides();
        const styleId = this.lesson?.presentation?.styleId || 'default';
        const hasContent = slides.length > 0;

        // Explicit Context Injection
        const aiContext = {
            subject: this.lesson?.subject || '',
            topic: this.lesson?.topic || '',
            title: this.lesson?.title || '',
            targetAudience: this.lesson?.targetAudience || ''
        };
        
        return html`
            <div data-tour="editor-presentation-start" class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>
                <div class="flex-1 overflow-hidden relative">
                    <div class="absolute inset-0 overflow-y-auto custom-scrollbar p-6">
                        <div class="max-w-5xl mx-auto space-y-8">

                            <!-- AI Generator Panel (Now in its own container, no extra nesting) -->
                            <div class="relative">
                                ${hasContent ? html`
                                    <div class="absolute top-4 right-16 z-20">
                                        <button @click=${this._exportToPptx} class="px-4 py-2 text-sm font-semibold rounded-lg transition transform hover:scale-105 flex items-center justify-center bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-indigo-200">
                                            💾 ${this.t('editor.download_pptx')}
                                        </button>
                                    </div>
                                ` : ''}

                                <ai-generator-panel
                                    @ai-completion="${this._handleAiCompletion}"
                                    .lesson=${this.lesson}
                                    .files=${this.files}
                                    .context=${aiContext}
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

                            <!-- Slides List -->
                            ${hasContent ? html`
                                <div class="space-y-6">
                                    ${slides.map((slide, index) => html`
                                        <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm relative group transition-all hover:shadow-md">
                                            <div class="flex justify-between items-start mb-4">
                                                <div class="flex items-center gap-3 flex-1">
                                                    <span class="bg-indigo-100 text-indigo-700 font-bold rounded-lg w-8 h-8 flex items-center justify-center text-sm">
                                                        ${index + 1}
                                                    </span>
                                                    <input
                                                        type="text"
                                                        .value="${slide.title || ''}"
                                                        @input="${e => this._handleSlideChange(index, 'title', e.target.value)}"
                                                        class="w-full text-lg font-bold text-slate-800 bg-transparent border-b border-transparent focus:border-indigo-500 focus:ring-0 p-1 transition-colors"
                                                        placeholder="${this.t('editor.presentation.slide_title_placeholder') || 'Nadpis slidu'}"
                                                    >
                                                </div>
                                                <button
                                                    @click="${() => this._removeSlide(index)}"
                                                    class="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                                                    title="${this.t('common.delete')}">
                                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                </button>
                                            </div>

                                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <!-- Content / Points -->
                                                <div>
                                                    <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                                        ${this.t('editor.presentation.content_label') || 'Obsah / Odrážky'}
                                                    </label>
                                                    <textarea
                                                        .value="${slide.points ? slide.points.join('\n') : (slide.content || '')}"
                                                        @input="${e => this._handleSlideChange(index, 'points', e.target.value)}"
                                                        class="w-full h-40 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none leading-relaxed"
                                                        placeholder="${this.t('editor.presentation.content_placeholder') || 'Obsah slidu (každý řádek nová odrážka)'}"
                                                    ></textarea>
                                                </div>

                                                <!-- Visuals / Notes -->
                                                <div>
                                                    <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                                        ${this.t('editor.presentation.visual_label') || 'Vizuální návrh (AI)'}
                                                    </label>
                                                    <div class="bg-indigo-50/50 border border-indigo-100 rounded-lg p-4 h-40 overflow-y-auto">
                                                        <p class="text-sm text-indigo-800 italic">
                                                            ${slide.visual_idea || this.t('editor.presentation.no_visual_suggestion')}
                                                        </p>
                                                        ${slide.imageUrl ? html`
                                                            <div class="mt-2">
                                                                <img src="${slide.imageUrl}" alt="Slide visual" class="rounded-md max-h-24 object-cover border border-slate-200">
                                                            </div>
                                                        ` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    `)}

                                    <div class="text-center pt-4">
                                        <button
                                            @click="${this._addSlide}"
                                            class="inline-flex items-center gap-2 px-6 py-2 bg-white border border-slate-300 rounded-full text-slate-600 hover:text-indigo-600 hover:border-indigo-600 hover:bg-indigo-50 transition-all font-medium text-sm shadow-sm">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                                            ${this.t('editor.presentation.add_slide') || 'Přidat slide'}
                                        </button>
                                    </div>
                                </div>
                            ` : ''}

                            <div class="h-24"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-presentation', EditorViewPresentation);
