import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { translationService } from '../../../utils/translation-service.js';

export class ProfessorHeaderEditor extends LitElement {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean }
    };

    createRenderRoot() { return this; }

    _dispatchBack() {
        this.dispatchEvent(new CustomEvent('back', { bubbles: true, composed: true }));
    }

    _dispatchSave() {
        this.dispatchEvent(new CustomEvent('save', { bubbles: true, composed: true }));
    }

    render() {
        // Fallback title if lesson is null or title is empty
        const title = this.lesson?.title || translationService.t('professor.editor.lessonTitlePlaceholder') || 'Nová lekce';
        const subject = this.lesson?.subject || 'Bez předmětu';
        const topic = this.lesson?.topic || 'Bez tématu';

        return html`
        <div class="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 sticky top-0 z-30 shadow-sm flex-shrink-0">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex flex-col md:flex-row justify-between items-center py-4 gap-4">

                <div class="flex items-center gap-4 w-full">
                <button @click="${this._dispatchBack}"
                        class="p-2 -ml-2 text-slate-400 hover:text-indigo-600 hover:bg-white/50 rounded-xl transition-all">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                    </svg>
                </button>

                <div class="flex-1">
                     <h1 class="text-2xl font-extrabold text-slate-800 truncate" title="${title}">
                        ${title}
                     </h1>
                    <div class="flex gap-2 text-xs text-slate-500 mt-1">
                            <span>${subject}</span>
                            <span>•</span>
                            <span>${topic}</span>
                    </div>
                </div>
                </div>

                <div class="flex items-center gap-3 flex-shrink-0">
                <button @click="${this._dispatchSave}"
                        class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-full shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none transition-all ${this.isSaving ? 'opacity-75 cursor-wait' : ''}"
                        ?disabled="${this.isSaving}">
                    ${this.isSaving ? translationService.t('common.loading') : translationService.t('professor.editor.saveChanges')}
                </button>
                </div>
            </div>
            </div>
        </div>
        `;
    }
}
customElements.define('professor-header-editor', ProfessorHeaderEditor);
