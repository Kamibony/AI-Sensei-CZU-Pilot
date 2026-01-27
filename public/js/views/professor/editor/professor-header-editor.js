import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';

export class ProfessorHeaderEditor extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean }
    };

    createRenderRoot() { return this; }

    _dispatchBack() {
        // Dispatch with bubbles: true to ensure it reaches the parent (LessonEditor)
        this.dispatchEvent(new CustomEvent('back', { bubbles: true, composed: true }));
    }

    _dispatchSave() {
        // Dispatch with bubbles: true to ensure it reaches the parent (LessonEditor)
        this.dispatchEvent(new CustomEvent('save', { bubbles: true, composed: true }));
    }

    _dispatchPublishToggle() {
        const newValue = !this.lesson?.isPublished;
        this.dispatchEvent(new CustomEvent('publish-changed', {
            detail: { isPublished: newValue },
            bubbles: true,
            composed: true
        }));
    }

    _dispatchAssign() {
        this.dispatchEvent(new CustomEvent('assign-class', { bubbles: true, composed: true }));
    }

    _togglePublish() {
        const newValue = !this.lesson?.isPublished;
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: { isPublished: newValue },
            bubbles: true,
            composed: true
        }));
    }

    _handleMetadataChange(e, field) {
        const value = e.target.value;
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: { [field]: value },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        // Fallback title if lesson is null or title is empty
        const title = this.lesson?.title || this.t('professor.editor.lessonTitlePlaceholder') || this.t('editor.titleNew');

        return html`
        <div data-tour="header-editor-start" class="bg-white border-b border-slate-200 sticky top-0 z-30 flex-shrink-0">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex flex-col md:flex-row justify-between items-center py-4 gap-4">

                <div class="flex items-center gap-4 w-full">
                <button @click="${this._dispatchBack}"
                        class="p-2 -ml-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-all">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                    </svg>
                </button>

                <div class="flex-1">
                     <h1 class="text-2xl font-extrabold text-slate-800 truncate" title="${title}">
                        ${title}
                     </h1>
                    <div class="flex gap-2 items-center mt-1">
                            <!-- Subject Input -->
                            <input
                                list="subjects-list"
                                type="text"
                                .value="${this.lesson?.subject || ''}"
                                @change="${(e) => this._handleMetadataChange(e, 'subject')}"
                                class="bg-transparent border-b border-slate-300 focus:border-indigo-500 text-xs text-slate-500 focus:outline-none focus:text-slate-800 transition-colors placeholder-slate-400 pb-0.5"
                                placeholder="${this.t('professor.editor.subject') || 'Předmět'}">

                            <span class="text-slate-300">•</span>

                            <!-- Topic Input -->
                            <input
                                type="text"
                                .value="${this.lesson?.topic || ''}"
                                @change="${(e) => this._handleMetadataChange(e, 'topic')}"
                                class="bg-transparent border-b border-slate-300 focus:border-indigo-500 text-xs text-slate-500 focus:outline-none focus:text-slate-800 transition-colors placeholder-slate-400 pb-0.5"
                                placeholder="${this.t('professor.editor.topic') || 'Téma'}">
                    </div>
                </div>
                </div>

                <div class="flex items-center gap-3 flex-shrink-0">

                <!-- Publish Toggle -->
                <button @click="${this._dispatchPublishToggle}"
                        class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-full shadow-sm text-white transition-all ${this.lesson?.isPublished ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-500 hover:bg-slate-600'}"
                        title="${this.lesson?.isPublished ? (this.t('lesson.status_published') || 'Publikované') : (this.t('lesson.status_draft') || 'Koncept')}">
                    <span class="mr-2">${this.lesson?.isPublished ? '🚀' : '📝'}</span>
                    ${this.lesson?.isPublished ? (this.t('lesson.status_published') || 'Publikované') : (this.t('lesson.status_draft') || 'Koncept')}
                </button>

                <!-- NEW: Assign Class Button -->
                <button @click="${this._dispatchAssign}"
                        class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-full shadow-sm text-white bg-indigo-500 hover:bg-indigo-600 focus:outline-none transition-all">
                    ${this.t('professor.editor.assign_class') || 'Priradiť triede'}
                </button>

                <!-- Auto-Save Indicator -->
                <div class="flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${this.isSaving ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}">
                    ${this.isSaving ? html`
                        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-indigo-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>${this.t('common.saving') || 'Ukládání...'}</span>
                    ` : html`
                        <span class="mr-1.5">☁️</span>
                        <span>${this.t('all_saved') || 'Vše uloženo'}</span>
                    `}
                </div>
                </div>
            </div>
            </div>
        </div>
        `;
    }
}
customElements.define('professor-header-editor', ProfessorHeaderEditor);
