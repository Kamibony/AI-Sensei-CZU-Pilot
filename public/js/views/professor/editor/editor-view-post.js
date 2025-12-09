import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { translationService } from '../../../services/translation-service.js';

export class EditorViewPost extends LitElement {
    static properties = {
        lesson: { type: Object }
    };

    constructor() {
        super();
        this._unsubscribe = null;
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._unsubscribe = translationService.subscribe(() => this.requestUpdate());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubscribe) this._unsubscribe();
    }

    _handleInput(field, value) {
        const newContent = { ...this.lesson.content, [field]: value };
        this.dispatchEvent(new CustomEvent('update', {
            detail: { content: newContent }
        }));
    }

    // Handle AI Generation request from parent
    handleAiGeneration(params) {
        // params contains { prompt, contentType, filePaths, ... }
        this._generateContent(params);
    }

    async _generateContent(params) {
        // Dynamically import to avoid circular dependencies if any, or just standard import.
        const { functions } = await import('../../../firebase-init.js');
        const { httpsCallable } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js");
        const { showToast } = await import('../../../utils.js');

        const generateContentFunc = httpsCallable(functions, 'generateContent');

        try {
            showToast(translationService.t('lesson.magic_preparing'));

            // params.contentType is 'post' for this view.
            const result = await generateContentFunc({
                ...params,
                contentType: 'post' // Enforce type
            });

            const generatedData = result.data; // Expecting { text: "...", author: "..." } or similar

            // Update lesson content
            const newContent = {
                ...this.lesson.content,
                text: generatedData.content || generatedData.text || '',
                author: 'ai_sensei'
            };

            this.dispatchEvent(new CustomEvent('update', {
                detail: { content: newContent }
            }));

            showToast(translationService.t('lesson.magic_done'));

        } catch (error) {
            console.error("AI Generation failed:", error);
            showToast(translationService.t('lesson.magic_error'), true);
        }
    }

    render() {
        const t = (key, params) => translationService.t(key, params);
        
        // Dynamically insert topic into default prompt
        const defaultPrompt = t('professor.editor.post.defaultPrompt', { topic: this.lesson.topic || 'Obecné téma' });

        return html`
            <div class="space-y-6 p-6">
                <!-- Content Editor -->
                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-2">${t('professor.editor.post.contentLabel')}</label>
                    <textarea
                        .value="${this.lesson.content?.text || ''}"
                        @input="${e => this._handleInput('text', e.target.value)}"
                        rows="12"
                        class="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                        placeholder="${t('professor.editor.post.contentPlaceholder')}"></textarea>
                </div>

                <!-- Author Settings -->
                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-2">${t('professor.editor.post.authorLabel')}</label>
                    <select
                        .value="${this.lesson.content?.author || 'ai_sensei'}"
                        @change="${e => this._handleInput('author', e.target.value)}"
                        class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                        <option value="ai_sensei">AI Sensei</option>
                        <option value="professor">${t('professor.default_name')}</option>
                    </select>
                </div>

                <!-- AI Helper Hint -->
                <div class="bg-indigo-50 rounded-xl p-4 border border-indigo-100 flex gap-3">
                    <div class="p-2 bg-white rounded-lg shadow-sm h-fit">
                        <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                        </svg>
                    </div>
                    <div>
                        <h4 class="text-sm font-semibold text-indigo-900 mb-1">Tip pro AI Generátor</h4>
                        <p class="text-sm text-indigo-700 leading-relaxed">
                            Pokud používáte magické generování, zkuste tento prompt:<br>
                            <span class="font-mono text-xs bg-indigo-100 px-2 py-1 rounded mt-1 block select-all cursor-pointer hover:bg-indigo-200 transition-colors"
                                  @click="${e => navigator.clipboard.writeText(e.target.innerText)}">
                                ${defaultPrompt}
                            </span>
                        </p>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-post', EditorViewPost);
