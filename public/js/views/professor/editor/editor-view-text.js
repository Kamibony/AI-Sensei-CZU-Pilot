// public/js/views/professor/editor/editor-view-text.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';
import './ai-generator-panel.js';
import './professor-header-editor.js';

export class EditorViewText extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean },
        files: { type: Array }
    };

    createRenderRoot() { return this; } // Light DOM enabled

    _handleInput(e) {
        if (!this.lesson) return;
        this.lesson.text_content = e.target.innerText;
        // Dispatch event so parent knows something changed (for auto-save etc)
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: { text_content: this.lesson.text_content },
            bubbles: true,
            composed: true
        }));
    }

    // --- Phase 2: Editor Standardization ---
    _handleAiCompletion(e) {
        const data = e.detail.data;
        if (!data) return;

        // 1. Normalize
        const cleanText = typeof data === 'object' ? (data.content || data.text_content || data.text || JSON.stringify(data)) : data;

        // 3. Assign
        this.lesson.text_content = cleanText;
        this.requestUpdate();

        // 4. Save
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: { text_content: cleanText },
            bubbles: true,
            composed: true
        }));
    }

    _handleDiscard() {
        if (confirm(this.t('common.confirm_discard') || "Opravdu chcete zahodit veškerý obsah a začít znovu?")) {
            this.lesson.text_content = '';
            this.dispatchEvent(new CustomEvent('lesson-updated', {
                detail: { text_content: '' },
                bubbles: true,
                composed: true
            }));
            this.requestUpdate();
        }
    }

    render() {
        // FORCE STRING CONVERSION (Hard-hardened against Data Poisoning)
        let safeContent = this.lesson?.text_content;

        if (typeof safeContent === 'object' && safeContent !== null) {
            safeContent = safeContent.content || safeContent.text_content || safeContent.text || '';
        }

        if (typeof safeContent !== 'string') {
            safeContent = String(safeContent || '');
        }

        // NOW it is safe to use .trim()
        const textContent = safeContent;
        const hasContent = !!textContent.trim();

        return html`
            <div data-tour="editor-text-start" data-editor-type="text" class="h-full flex flex-col bg-slate-50 relative">
                <!-- Header -->
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                <!-- Scrollable Workspace -->
                <div class="flex-1 overflow-y-auto custom-scrollbar p-6">

                    <!-- Paper Container -->
                    <div class="max-w-5xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm min-h-[600px] flex flex-col relative transition-all duration-300">

                        ${hasContent ? html`
                            <!-- Rich Text Editor Mode (Simple ContentEditable) -->
                            <div class="p-8 md:p-12 w-full h-full flex-1 flex flex-col">
                                <div
                                    data-tour="text-editor-content"
                                    class="prose prose-lg prose-slate max-w-none focus:outline-none w-full flex-1 min-h-[400px]"
                                    contenteditable="true"
                                    style="white-space: pre-wrap;"
                                    @input="${this._handleInput}"
                                    .innerHTML="${textContent}"
                                ></div>
                                <div class="mt-8 pt-6 border-t border-slate-100 flex justify-center">
                                    <button
                                        data-tour="text-discard-btn"
                                        @click="${this._handleDiscard}"
                                        class="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium flex items-center gap-2"
                                    >
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                        ${this.t('common.discard_restart') !== 'common.discard_restart' ? this.t('common.discard_restart') : 'Zahodit a začít znovu'}
                                    </button>
                                </div>
                            </div>
                        ` : html`
                            <!-- Empty State: AI Generator -->
                            <div data-tour="text-ai-container" class="w-full h-full flex-1 flex flex-col">
                                <ai-generator-panel
                                    @ai-completion="${this._handleAiCompletion}"
                                    .lesson=${this.lesson}
                                    .files=${this.files}
                                    .context=${{ existingText: safeContent }}
                                    viewTitle="${this.t('editor.text.title')}"
                                    contentType="text"
                                    fieldToUpdate="text_content"
                                    description="${this.t('editor.text.description')}"
                                    .inputsConfig=${[{
                                        id: 'prompt-input',
                                        type: 'textarea',
                                        label: this.t('editor.prompt_label'),
                                        placeholder: this.t('editor.text.placeholder')
                                    }]}>
                                </ai-generator-panel>
                            </div>
                        `}

                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-text', EditorViewText);
