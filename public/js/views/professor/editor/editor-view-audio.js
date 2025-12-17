import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";
import { ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { storage } from '../../../firebase-init.js'; // FIX: Import shared storage instance
import { Localized } from '../../../utils/localization-mixin.js';
import { showToast } from '../../../utils.js';
import './professor-header-editor.js';

export class EditorViewAudio extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean },
        isGenerating: { type: Boolean },
        audioUrl: { type: String }
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.lesson = {};
        this.isGenerating = false;
        this.audioUrl = null;
    }

    firstUpdated() {
        this._checkExistingAudio();
    }

    async _checkExistingAudio() {
        // If lesson has a podcast path, try to get the URL
        if (this.lesson.podcast_audio_path) {
            try {
                // FIX: Use the imported storage instance
                const audioRef = ref(storage, this.lesson.podcast_audio_path);
                this.audioUrl = await getDownloadURL(audioRef);
                this.requestUpdate();
            } catch (error) {
                console.error("Error loading existing audio:", error);
            }
        }
    }

    _handleScriptChange(e) {
        // Update local lesson state
        const content = this.lesson.content ? JSON.parse(JSON.stringify(this.lesson.content)) : {};
        content.script = e.target.value;

        // Dispatch update for auto-save (using correct event name)
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: {
                content: content
            },
            bubbles: true,
            composed: true
        }));
    }

    async _generateAudio() {
        const script = this.lesson.content?.script;
        if (!script || script.trim().length === 0) {
            showToast(this.t('editor.audio.error_no_script'), "warning");
            return;
        }

        this.isGenerating = true;

        try {
            const functions = getFunctions();
            const generatePodcastAudio = httpsCallable(functions, 'generatePodcastAudio');

            const result = await generatePodcastAudio({
                lessonId: this.lesson.id,
                text: script,
                language: 'cs-CZ' // Default to CZ for now, could be dynamic
            });

            if (result.data.success) {
                showToast(this.t('editor.audio.success_generated'), "success");
                // Update lesson with new path if returned, or just refresh audio
                if (result.data.storagePath) {
                    // Update internal lesson object to match backend state
                    this.lesson.podcast_audio_path = result.data.storagePath;
                    await this._checkExistingAudio();
                }
            }

        } catch (error) {
            console.error("Error generating audio:", error);
            showToast(`${this.t('editor.audio.error_generation')}${error.message}`, "error");
        } finally {
            this.isGenerating = false;
        }
    }

    _insertTag(tag) {
        const textarea = this.querySelector('#script-editor');
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);

        textarea.value = before + tag + after;
        textarea.selectionStart = textarea.selectionEnd = start + tag.length;
        textarea.focus();

        // Trigger input event manually
        textarea.dispatchEvent(new Event('input'));
    }

    render() {
        const script = this.lesson.content?.script || '';

        return html`
            <div class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                <div class="flex-1 overflow-hidden relative">
                    <div class="absolute inset-0 overflow-y-auto custom-scrollbar p-6">
                        <div class="max-w-5xl mx-auto space-y-6">

                            <div class="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 flex flex-col md:flex-row gap-8 items-start">
                                <div class="flex-1">
                                    <h2 class="text-2xl font-bold text-slate-800 mb-2">${this.t('editor.audio.title')}</h2>
                                    <p class="text-slate-500">${this.t('editor.audio.subtitle')}</p>

                                    <div class="flex gap-2 mt-4">
                                        <button @click="${() => this._insertTag('[Alex]: ')}" class="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors">
                                            ${this.t('editor.audio.add_alex')}
                                        </button>
                                        <button @click="${() => this._insertTag('[Sarah]: ')}" class="px-3 py-1 bg-pink-50 text-pink-700 rounded-lg text-sm font-medium hover:bg-pink-100 transition-colors">
                                            ${this.t('editor.audio.add_sarah')}
                                        </button>
                                    </div>
                                </div>

                                <div class="w-full md:w-80 bg-slate-50 rounded-2xl p-4 border border-slate-200">
                                    ${this.audioUrl ? html`
                                        <div class="mb-3 text-sm font-medium text-slate-700">${this.t('editor.audio.preview_label')}</div>
                                        <audio controls class="w-full mb-3" src="${this.audioUrl}"></audio>
                                        <a href="${this.audioUrl}" download="podcast.mp3" class="text-xs text-indigo-600 hover:underline block text-center">${this.t('editor.audio.download_mp3')}</a>
                                    ` : html`
                                        <div class="h-24 flex items-center justify-center text-slate-400 text-sm italic border-2 border-dashed border-slate-200 rounded-lg">
                                            ${this.t('editor.audio.not_generated')}
                                        </div>
                                    `}

                                    <button
                                        @click="${this._generateAudio}"
                                        ?disabled="${this.isGenerating}"
                                        class="w-full mt-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-xl font-medium transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
                                    >
                                        ${this.isGenerating ? html`
                                            <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            ${this.t('editor.audio.generating')}
                                        ` : html`
                                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                                            ${this.t('editor.audio.generate_btn')}
                                        `}
                                    </button>
                                </div>
                            </div>

                            <div class="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[600px]">
                                <div class="bg-slate-50 px-6 py-3 border-b border-slate-200 text-xs font-medium text-slate-500 uppercase tracking-wider">
                                    ${this.t('editor.audio.script_label')}
                                </div>
                                <textarea
                                    id="script-editor"
                                    class="flex-1 w-full p-6 text-base leading-relaxed text-slate-800 focus:outline-none resize-none font-mono"
                                    placeholder="${this.t('editor.audio.script_placeholder')}"
                                    .value="${script}"
                                    @input="${this._handleScriptChange}"
                                ></textarea>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-audio', EditorViewAudio);
