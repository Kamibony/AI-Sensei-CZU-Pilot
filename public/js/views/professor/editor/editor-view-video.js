// public/js/views/professor/editor/editor-view-video.js
import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';
import './professor-header-editor.js';
import './ai-generator-panel.js';

export class EditorViewVideo extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean },
        files: { type: Array },
        _videoId: { state: true, type: String }
    };

    createRenderRoot() { return this; }

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson')) {
            this._updateVideoId(this.lesson?.videoUrl || '');
        }
    }

    _updateVideoId(url) {
        if (!url) { this._videoId = null; return false; }
        const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?#]+)/);
        this._videoId = videoIdMatch ? videoIdMatch[1] : null;
        return !!this._videoId;
    }

    _handleInput(e) {
        const url = e.target.value.trim();
        const isValid = this._updateVideoId(url);

        // Update lesson object directly
        if (this.lesson) {
            this.lesson.videoUrl = url;
        }

        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: { videoUrl: url },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
            <div data-tour="editor-video-start" class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <div class="max-w-5xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm min-h-[600px] flex flex-col relative overflow-hidden">

                        <!-- Content Area -->
                        <div class="p-8 md:p-12 space-y-8">

                            <!-- Input Section -->
                            <div class="space-y-4">
                                <label class="block text-sm font-semibold text-slate-700 uppercase tracking-wide">
                                    ${this.t('editor.video.url_label')}
                                </label>
                                <input
                                    type="text"
                                    class="w-full text-lg p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-slate-300"
                                    placeholder="${this.t('editor.video.url_placeholder')}"
                                    .value="${this.lesson?.videoUrl || ''}"
                                    @input="${this._handleInput}"
                                >
                            </div>

                            <!-- Preview Section -->
                            ${this._videoId ? html`
                                <div class="relative w-full aspect-video rounded-xl overflow-hidden bg-black shadow-lg">
                                    <iframe
                                        src="https://www.youtube.com/embed/${this._videoId}"
                                        frameborder="0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowfullscreen
                                        class="absolute top-0 left-0 w-full h-full"
                                    ></iframe>
                                </div>
                            ` : html`
                                <div class="w-full aspect-video bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
                                    <svg class="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                    <span class="font-medium">${this.t('editor.video.preview_placeholder')}</span>
                                </div>
                            `}

                            <!-- Optional: AI Description Helper (Fallback) -->
                            <div class="pt-8 border-t border-slate-100">
                                <ai-generator-panel
                                    .lesson=${this.lesson}
                                    .files=${this.files}
                                    viewTitle="${this.t('editor.video.ai_title')}"
                                    contentType="text"
                                    fieldToUpdate="text_content"
                                    description="${this.t('editor.video.ai_description')}"
                                    promptPlaceholder="${this.t('editor.video.ai_placeholder')}"
                                    .isCompact="${true}"
                                ></ai-generator-panel>
                            </div>

                        </div>

                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-video', EditorViewVideo);
