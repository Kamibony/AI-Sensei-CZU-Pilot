import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { translationService } from '../../../services/translation-service.js';
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

    // Handle AI Generation request from parent if needed (legacy support)
    handleAiGeneration(params) {
        this._generateContent(params);
    }

    async _generateContent(params) {
        // Dynamically import to avoid circular dependencies
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
        
        // Dynamically insert topic into default prompt
        const defaultPrompt = t('professor.editor.post.defaultPrompt', { topic: this.lesson.topic || 'Obecné téma' });

        return html`
            <div class="h-full bg-slate-50 overflow-y-auto p-4 md:p-8">
                <div class="max-w-5xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden min-h-[800px] flex flex-col">
                     <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                     <div class="flex-1 p-6 md:p-8">
                        <div class="flex flex-col lg:flex-row gap-8 h-full">
                            <!-- Left: Inputs -->
                            <div class="w-full lg:w-1/2 flex flex-col gap-6">
                                <div>
                                    <h3 class="text-lg font-bold text-slate-800 mb-4">Obsah Příspěvku</h3>

                                    <div class="space-y-4">
                                         <div>
                                            <label class="block text-sm font-medium text-slate-700 mb-2">${t('professor.editor.post.authorLabel')}</label>
                                            <div class="relative">
                                                <select
                                                    .value="${this.lesson.content?.author || 'ai_sensei'}"
                                                    @change="${e => this._handleInput('author', e.target.value)}"
                                                    class="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 appearance-none font-medium text-slate-700">
                                                    <option value="ai_sensei">🤖 AI Sensei</option>
                                                    <option value="professor">👨‍🏫 ${t('professor.default_name')}</option>
                                                </select>
                                                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <label class="block text-sm font-medium text-slate-700 mb-2">${t('professor.editor.post.contentLabel')}</label>
                                            <textarea
                                                .value="${this.lesson.content?.text || ''}"
                                                @input="${e => this._handleInput('text', e.target.value)}"
                                                rows="12"
                                                class="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-slate-700 leading-relaxed resize-none"
                                                placeholder="${t('professor.editor.post.contentPlaceholder')}"></textarea>
                                        </div>
                                    </div>
                                </div>

                                <!-- AI Helper Hint -->
                                <div class="bg-indigo-50 rounded-xl p-4 border border-indigo-100 flex gap-3">
                                    <div class="p-2 bg-white rounded-lg shadow-sm h-fit shrink-0">
                                        <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                        </svg>
                                    </div>
                                    <div>
                                        <h4 class="text-sm font-semibold text-indigo-900 mb-1">Tip pro AI Generátor</h4>
                                        <p class="text-sm text-indigo-700 leading-relaxed">
                                            Pokud chcete vygenerovat příspěvek automaticky, použijte "Generovat obsah" v hlavičce editoru.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <!-- Right: Mobile Preview -->
                            <div class="w-full lg:w-1/2 flex items-start justify-center pt-4">
                                <!-- Phone Container -->
                                <div class="w-[320px] h-[640px] bg-slate-900 rounded-[3rem] p-4 shadow-2xl border-4 border-slate-800 relative select-none">
                                    <!-- Notch -->
                                    <div class="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-slate-900 rounded-b-xl z-20"></div>
                                    <!-- Side Buttons -->
                                    <div class="absolute top-24 -left-2 w-1 h-10 bg-slate-800 rounded-l-md"></div>
                                    <div class="absolute top-36 -left-2 w-1 h-16 bg-slate-800 rounded-l-md"></div>
                                    <div class="absolute top-28 -right-2 w-1 h-12 bg-slate-800 rounded-r-md"></div>

                                    <!-- Screen -->
                                    <div class="w-full h-full bg-slate-50 rounded-[2.2rem] overflow-hidden flex flex-col relative z-10">
                                        <!-- Status Bar Mock -->
                                        <div class="h-8 bg-white flex justify-between items-center px-6 text-[10px] font-bold text-slate-800 z-10 select-none">
                                            <span>9:41</span>
                                            <div class="flex gap-1">
                                                <span>📶</span>
                                                <span>🔋</span>
                                            </div>
                                        </div>

                                        <!-- Feed Header -->
                                        <div class="bg-white border-b border-slate-100 p-3 flex items-center gap-2 shadow-sm z-10">
                                            <div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">AI</div>
                                            <span class="font-bold text-slate-800 text-sm">Classroom Feed</span>
                                        </div>

                                        <!-- Feed Content (Scrollable) -->
                                        <div class="flex-1 overflow-y-auto p-3 custom-scrollbar bg-slate-50">
                                            <!-- The Card -->
                                            <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-3">
                                                <div class="flex items-center gap-3 mb-3">
                                                    <div class="w-10 h-10 rounded-full ${this.lesson.content?.author === 'professor' ? 'bg-indigo-600 text-white' : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'} flex items-center justify-center font-bold shadow-sm shrink-0">
                                                        ${this.lesson.content?.author === 'professor' ? 'P' : '🤖'}
                                                    </div>
                                                    <div>
                                                        <div class="font-bold text-slate-800 text-sm">
                                                            ${this.lesson.content?.author === 'professor' ? t('professor.default_name') : 'AI Sensei'}
                                                        </div>
                                                        <div class="text-[10px] text-slate-400">Právě teď • ${this.lesson.topic || 'Obecné'}</div>
                                                    </div>
                                                </div>

                                                <div class="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words">
                                                    ${this.lesson.content?.text || html`<span class="text-slate-300 italic">Zde se zobrazí náhled příspěvku...</span>`}
                                                </div>

                                                <div class="mt-4 pt-3 border-t border-slate-50 flex justify-between text-slate-400">
                                                    <div class="flex gap-4 text-xs">
                                                        <span class="flex items-center gap-1">❤️ 0</span>
                                                        <span class="flex items-center gap-1">💬 0</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <!-- Placeholder for other posts -->
                                            <div class="opacity-50 blur-[1px]">
                                                 <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-4 mb-3">
                                                    <div class="flex items-center gap-3 mb-2">
                                                        <div class="w-8 h-8 rounded-full bg-slate-200"></div>
                                                        <div class="h-2 w-24 bg-slate-200 rounded"></div>
                                                    </div>
                                                    <div class="space-y-2">
                                                        <div class="h-2 w-full bg-slate-100 rounded"></div>
                                                        <div class="h-2 w-3/4 bg-slate-100 rounded"></div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <!-- Bottom Nav Mock -->
                                        <div class="bg-white h-12 border-t border-slate-100 flex justify-around items-center text-xl text-slate-300">
                                            <span class="text-indigo-600">🏠</span>
                                            <span>🔍</span>
                                            <span>👤</span>
                                        </div>
                                    </div>
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
