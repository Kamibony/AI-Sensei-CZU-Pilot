import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { translationService } from '../../../utils/translation-service.js';
import './professor-header-editor.js';

export class EditorViewPost extends LitElement {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean }
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
            detail: { content: newContent },
            bubbles: true,
            composed: true
        }));
    }

    handleAiGeneration(params) {
        this._generateContent(params);
    }

    async _generateContent(params) {
        const { functions } = await import('../../../firebase-init.js');
        const { httpsCallable } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js");
        const { showToast } = await import('../../../utils.js');

        const generateContentFunc = httpsCallable(functions, 'generateContent');

        try {
            showToast(translationService.t('lesson.magic_preparing'));

            const result = await generateContentFunc({
                ...params,
                contentType: 'post'
            });

            const generatedData = result.data;
            const newContent = {
                ...this.lesson.content,
                text: generatedData.content || generatedData.text || '',
                author: 'ai_sensei'
            };

            this.dispatchEvent(new CustomEvent('update', {
                detail: { content: newContent },
                bubbles: true,
                composed: true
            }));

            showToast(translationService.t('lesson.magic_done'));

        } catch (error) {
            console.error("AI Generation failed:", error);
            showToast(translationService.t('lesson.magic_error'), true);
        }
    }

    render() {
        const t = (key, params) => translationService.t(key, params);
        const contentText = this.lesson.content?.text || '';
        const author = this.lesson.content?.author || 'ai_sensei';
        const defaultPrompt = t('professor.editor.post.defaultPrompt', { topic: this.lesson.topic || 'Obecné téma' });

        // Helper to format text for preview (simple line breaks)
        const formattedText = contentText.split('\n').map(line => html`${line}<br>`);

        return html`
            <div class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <div class="max-w-5xl mx-auto w-full">

                        <div class="mb-6">
                            <h2 class="text-2xl font-bold text-slate-800">Příspěvek</h2>
                            <p class="text-slate-500 text-sm">Vytvořte krátký příspěvek pro sociální sítě nebo školní nástěnku.</p>
                        </div>

                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">

                            <!-- Left Column: Editor -->
                            <div class="space-y-6">
                                <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
                                    <div>
                                        <label class="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">
                                            ${t('professor.editor.post.contentLabel')}
                                        </label>
                                        <textarea
                                            .value="${contentText}"
                                            @input="${e => this._handleInput('text', e.target.value)}"
                                            rows="12"
                                            class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                                            placeholder="${t('professor.editor.post.contentPlaceholder')}"></textarea>
                                    </div>

                                    <div>
                                        <label class="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">
                                            ${t('professor.editor.post.authorLabel')}
                                        </label>
                                        <select
                                            .value="${author}"
                                            @change="${e => this._handleInput('author', e.target.value)}"
                                            class="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                                            <option value="ai_sensei">AI Sensei</option>
                                            <option value="professor">${t('professor.default_name')}</option>
                                        </select>
                                    </div>
                                </div>

                                <!-- AI Hint -->
                                <div class="bg-indigo-50/50 rounded-xl p-4 border border-indigo-100 flex gap-3">
                                    <div class="p-2 bg-white rounded-lg shadow-sm h-fit text-indigo-600">
                                        ✨
                                    </div>
                                    <div>
                                        <h4 class="text-sm font-bold text-indigo-900 mb-1">${t('professor.editor.post.ai_tip_title')}</h4>
                                        <p class="text-xs text-indigo-700 leading-relaxed">
                                            ${t('professor.editor.post.ai_tip_desc')}
                                            <span class="font-mono bg-indigo-100 px-1 rounded cursor-pointer hover:bg-indigo-200 transition-colors"
                                                @click="${e => navigator.clipboard.writeText(e.target.innerText)}">
                                                ${defaultPrompt}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <!-- Right Column: Mobile Preview -->
                            <div class="flex justify-center items-start pt-4">
                                <div class="relative w-[320px] h-[600px] bg-slate-900 rounded-[3rem] shadow-2xl border-4 border-slate-800 overflow-hidden ring-4 ring-slate-200/50">
                                    <!-- Phone Status Bar -->
                                    <div class="absolute top-0 w-full h-8 bg-slate-900 z-20 flex justify-between items-center px-6 text-[10px] text-white font-medium">
                                        <span>9:41</span>
                                        <div class="flex gap-1.5">
                                            <div class="w-3 h-3 bg-white rounded-full opacity-20"></div>
                                            <div class="w-3 h-3 bg-white rounded-full opacity-20"></div>
                                            <div class="w-4 h-2.5 border border-white rounded-sm"></div>
                                        </div>
                                    </div>
                                    <!-- Notch -->
                                    <div class="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-900 rounded-b-xl z-20"></div>

                                    <!-- Phone Screen Content -->
                                    <div class="w-full h-full bg-slate-50 pt-10 overflow-y-auto custom-scrollbar">

                                        <!-- Mock App Header -->
                                        <div class="bg-white p-4 border-b border-slate-100 sticky top-0 z-10 flex items-center justify-between">
                                            <div class="font-bold text-slate-800">Feed</div>
                                            <div class="w-8 h-8 bg-slate-100 rounded-full"></div>
                                        </div>

                                        <!-- Post Card -->
                                        <div class="p-4">
                                            <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                                <!-- Post Header -->
                                                <div class="p-4 flex items-center gap-3">
                                                    <div class="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm
                                                        ${author === 'ai_sensei' ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : 'bg-slate-700'}">
                                                        ${author === 'ai_sensei' ? 'A' : 'P'}
                                                    </div>
                                                    <div>
                                                        <div class="font-bold text-slate-900 text-sm">
                                                            ${author === 'ai_sensei' ? 'AI Sensei' : t('professor.default_name')}
                                                        </div>
                                                        <div class="text-xs text-slate-400">${t('professor.editor.post.just_now')}</div>
                                                    </div>
                                                </div>

                                                <!-- Post Content -->
                                                <div class="px-4 pb-4 text-slate-800 text-sm leading-relaxed">
                                                    ${contentText ? formattedText : html`<span class="text-slate-300 italic">${t('professor.editor.post.preview_placeholder')}</span>`}
                                                </div>

                                                <!-- Post Footer / Stats -->
                                                <div class="px-4 py-3 border-t border-slate-50 flex justify-between text-slate-400 text-xs">
                                                    <div class="flex gap-4">
                                                        <span class="flex items-center gap-1 hover:text-red-500 transition-colors cursor-pointer">
                                                            ❤️ 24
                                                        </span>
                                                        <span class="flex items-center gap-1 hover:text-blue-500 transition-colors cursor-pointer">
                                                            💬 3
                                                        </span>
                                                    </div>
                                                    <span class="flex items-center gap-1 hover:text-slate-600 transition-colors cursor-pointer">
                                                        ↗️ ${t('professor.editor.post.share')}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Other Content Mockup -->
                                        <div class="px-4 pb-4 space-y-4 opacity-50 pointer-events-none grayscale">
                                            <div class="bg-white h-32 rounded-2xl border border-slate-100"></div>
                                            <div class="bg-white h-32 rounded-2xl border border-slate-100"></div>
                                        </div>

                                    </div>

                                    <!-- Phone Home Bar -->
                                    <div class="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-slate-800 rounded-full z-20"></div>
                                </div>
                            </div>

                        </div>
                     </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-post', EditorViewPost);
