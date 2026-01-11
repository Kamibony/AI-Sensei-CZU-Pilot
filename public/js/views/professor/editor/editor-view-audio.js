import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { functions } from '../../../firebase-init.js';
import { Localized } from '../../../utils/localization-mixin.js';
import './professor-header-editor.js';
import './ai-generator-panel.js';

export class EditorViewAudio extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean },
        isGeneratingAudio: { type: Boolean, state: true }
    };

    createRenderRoot() { return this; }

    _updateScript(newScript) {
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: { podcast_script: newScript },
            bubbles: true,
            composed: true
        }));
    }

    _handleLineChange(index, field, value) {
        const script = [...(this.lesson.podcast_script || [])];
        script[index] = { ...script[index], [field]: value };
        this._updateScript(script);
    }

    _addLine() {
        const script = [...(this.lesson.podcast_script || [])];
        // Alternate speaker if possible
        const lastSpeaker = script.length > 0 ? script[script.length - 1].speaker : 'Guest';
        const newSpeaker = lastSpeaker === 'Host' ? 'Guest' : 'Host';
        script.push({ speaker: newSpeaker, text: '' });
        this._updateScript(script);
    }

    _deleteLine(index) {
        const script = [...(this.lesson.podcast_script || [])];
        script.splice(index, 1);
        this._updateScript(script);
    }

    async _generateAudio() {
        if (this.isGeneratingAudio) return;

        const rawScript = this.lesson?.podcast_script;
        if (!Array.isArray(rawScript) || rawScript.length === 0) {
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: 'Scénář je prázdný.', type: 'error' }
            }));
            return;
        }

        // Construct text in format: "[Speaker]: Text..."
        const fullText = rawScript
            .map(line => `[${line.speaker}]: ${line.text}`)
            .join('\n');

        this.isGeneratingAudio = true;
        try {
            const generateAudio = httpsCallable(functions, 'generatePodcastAudio');
            const result = await generateAudio({
                lessonId: this.lesson.id,
                text: fullText,
                language: 'cs-CZ' // Default language
            });

            if (result.data && result.data.audioUrl) {
                // Update lesson with new audio URL
                this.dispatchEvent(new CustomEvent('lesson-updated', {
                    detail: { podcast_audio_url: result.data.audioUrl },
                    bubbles: true,
                    composed: true
                }));

                window.dispatchEvent(new CustomEvent('show-toast', {
                    detail: { message: 'Audio úspěšně vygenerováno.', type: 'success' }
                }));
            }
        } catch (error) {
            console.error('Audio generation failed:', error);
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: `Generování selhalo: ${error.message}`, type: 'error' }
            }));
        } finally {
            this.isGeneratingAudio = false;
        }
    }

    render() {
        const rawScript = this.lesson?.podcast_script;
        const script = Array.isArray(rawScript) ? rawScript : [];
        const hasContent = script.length > 0;
        const audioUrl = this.lesson?.podcast_audio_url;

        return html`
            <div class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                <div class="flex-1 overflow-hidden relative">
                    <div class="absolute inset-0 overflow-y-auto custom-scrollbar p-6">
                        <div class="max-w-5xl mx-auto space-y-6">

                            ${hasContent ? html`
                                <div class="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 md:p-8">
                                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                                        <div>
                                            <h2 class="text-2xl font-bold text-slate-800">${this.t('editor.audio.title')}</h2>
                                            <p class="text-slate-500">${this.t('editor.audio.subtitle')}</p>
                                        </div>
                                        <button
                                            @click="${this._generateAudio}"
                                            ?disabled="${this.isGeneratingAudio}"
                                            class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl font-semibold shadow-sm transition-all flex items-center gap-2"
                                        >
                                            ${this.isGeneratingAudio ? html`
                                                <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Generuji audio...
                                            ` : html`
                                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                                                Generovat Audio
                                            `}
                                        </button>
                                    </div>

                                    ${audioUrl ? html`
                                        <div class="mb-8 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                                            <div class="flex items-center gap-3 mb-2">
                                                <span class="text-xs font-bold text-indigo-500 uppercase tracking-wider">Přehrávač</span>
                                            </div>
                                            <audio controls class="w-full" src="${audioUrl}"></audio>
                                        </div>
                                    ` : nothing}

                                    <div class="space-y-4">
                                        ${script.map((line, index) => html`
                                            <div class="flex gap-4 group">
                                                <div class="w-32 flex-shrink-0 pt-1">
                                                    <select
                                                        .value="${line.speaker}"
                                                        @change="${e => this._handleLineChange(index, 'speaker', e.target.value)}"
                                                        class="w-full text-sm font-semibold rounded-lg border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 ${line.speaker === 'Host' ? 'text-indigo-600 bg-indigo-50' : 'text-pink-600 bg-pink-50'}"
                                                    >
                                                        <option value="Host">Host</option>
                                                        <option value="Guest">Guest</option>
                                                    </select>
                                                </div>
                                                <div class="flex-1 relative">
                                                    <textarea
                                                        .value="${line.text || ''}"
                                                        @input="${e => this._handleLineChange(index, 'text', e.target.value)}"
                                                        class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none overflow-hidden"
                                                        rows="2"
                                                        style="min-height: 80px"
                                                        placeholder="${this.t('editor.audio.text_placeholder')}"
                                                    ></textarea>
                                                    <button
                                                        @click="${() => this._deleteLine(index)}"
                                                        class="absolute -right-3 -top-3 p-1 bg-white rounded-full text-slate-400 hover:text-red-500 shadow-sm border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="${this.t('common.delete')}"
                                                    >
                                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        `)}
                                    </div>

                                    <div class="mt-8 flex justify-center">
                                        <button
                                            @click="${this._addLine}"
                                            class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                                        >
                                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                                            ${this.t('editor.audio.add_line')}
                                        </button>
                                    </div>
                                </div>
                            ` : html`
                                <ai-generator-panel
                                    .lesson="${this.lesson}"
                                    viewTitle="${this.t('editor.audio.title')}"
                                    contentType="podcast"
                                    fieldToUpdate="podcast_script"
                                    description="${this.t('editor.audio.description')}"
                                    .inputsConfig=${[{
                                        id: 'episode_count',
                                        type: 'number',
                                        label: 'Počet epizod (aktuálně fixně 1)',
                                        default: 1,
                                        min: 1,
                                        max: 1
                                    }]}
                                ></ai-generator-panel>
                            `}

                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-audio', EditorViewAudio);
