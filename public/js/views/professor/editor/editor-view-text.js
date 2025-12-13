// public/js/views/professor/editor/editor-view-text.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';
import './ai-generator-panel.js';
import './professor-header-editor.js';

export class EditorViewText extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean }
    };

    createRenderRoot() { return this; }

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

    render() {
        const hasContent = !!(this.lesson && this.lesson.text_content && this.lesson.text_content.trim().length > 0);

        return html`
            <div class="h-full flex flex-col bg-slate-50 relative">
                <!-- Header -->
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                <!-- Scrollable Workspace -->
                <div class="flex-1 overflow-y-auto custom-scrollbar p-6">

                    <!-- Paper Container -->
                    <div class="max-w-5xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm min-h-[600px] flex flex-col relative transition-all duration-300">

                        ${hasContent ? html`
                            <!-- Rich Text Editor Mode (Simple ContentEditable) -->
                            <div class="p-8 md:p-12 w-full h-full flex-1">
                                <div
                                    class="prose prose-lg prose-slate max-w-none focus:outline-none w-full h-full min-h-[400px]"
                                    contenteditable="true"
                                    @input="${this._handleInput}"
                                    .innerText="${this.lesson.text_content}"
                                ></div>
                            </div>
                        ` : html`
                            <!-- Empty State: AI Generator -->
                            <div class="w-full h-full flex-1 flex flex-col">
                                <ai-generator-panel
                                    .lesson=${this.lesson}
                                    viewTitle="${this.t('editor.text.title')}"
                                    contentType="text"
                                    fieldToUpdate="text_content"
                                    description="${this.t('editor.text.description')}"
                                    promptPlaceholder="${this.t('editor.text.placeholder')}">
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
