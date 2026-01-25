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
        files: { type: Array },
        isGeneratingAudio: { type: Boolean, state: true },
        isDialogueMode: { type: Boolean, state: true },
        voiceGender: { type: String, state: true }
    };

    constructor() {
        super();
        this.isDialogueMode = true;
        this.voiceGender = 'male';
    }

    createRenderRoot() { return this; }

    _getScript() {
        let script = [];
        const raw = this.lesson?.podcast_script;

        if (raw) {
            if (Array.isArray(raw)) {
                script = raw;
            } else if (typeof raw === 'object' && Array.isArray(raw.podcast_script)) {
                 script = raw.podcast_script;
            } else if (typeof raw === 'string') {
                 try {
                     const parsed = JSON.parse(raw);
                     script = parsed.podcast_script || (Array.isArray(parsed) ? parsed : []);
                 } catch(e) { console.warn("Failed to parse podcast script", e); }
            }
        }
        return script;
    }

    _updateScript(newScript) {
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: { partial: { podcast_script: newScript } },
            bubbles: true,
            composed: true
        }));
    }

    _handleLineChange(index, field, value) {
        const script = [...this._getScript()];
        if (script[index]) {
            script[index] = { ...script[index], [field]: value };
            this._updateScript(script);
        }
    }

    _addLine() {
        const script = [...this._getScript()];
        // Alternate speaker if possible
        const lastSpeaker = script.length > 0 ? script[script.length - 1].speaker : 'Guest';
        const newSpeaker = lastSpeaker === 'Host' ? 'Guest' : 'Host';
        script.push({ speaker: newSpeaker, text: '' });
        this._updateScript(script);
    }

    _deleteLine(index) {
        const script = [...this._getScript()];
        script.splice(index, 1);
        this._updateScript(script);
    }

    // --- Phase 2: Editor Standardization ---
    async _handleAiCompletion(e) {
        const data = e.detail.data;
        if (!data) return;

        // 1. Normalize
        let script = [];
        if (typeof data === 'object') {
             if (Array.isArray(data.script)) script = data.script;
             else if (Array.isArray(data)) script = data;
        } else if (typeof data === 'string') {
             try {
                 const parsed = JSON.parse(data);
                 if (parsed.script) script = parsed.script;
                 else if (Array.isArray(parsed)) script = parsed;
             } catch (e) {
                 // Fallback if just text
                 script = [{ speaker: "Host", text: data }];
             }
        }

        // 3. Assign & 4. Save
        if (script.length > 0) {
            this.lesson = { ...this.lesson, podcast_script: script };
            this._updateScript(script);
            await this.requestUpdate();

            // Phase 4: Chain Audio Generation
            // Trigger audio generation immediately after script is ready
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: 'Scénář připraven. Generuji audio...', type: 'info' }
            }));
            await this._generateAudio();
        }
    }

    _handleDiscard() {
        if (confirm(this.t('common.confirm_discard') || "Opravdu chcete zahodit veškerý obsah a začít znovu?")) {
            this.lesson.podcast_script = [];
            this._updateScript([]);
            this.requestUpdate();
        }
    }

    async _generateAudio() {
        if (this.isGeneratingAudio) return;

        const script = this._getScript();
        if (script.length === 0) {
            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: 'Scénář je prázdný.', type: 'error' }
            }));
            return;
        }

        // Construct text based on mode
        let fullText = "";
        if (this.isDialogueMode) {
            fullText = script
                .map(line => `[${line.speaker}]: ${line.text}`)
                .join('\n');
        } else {
            // Monologue: Just text, no tags
            fullText = script
                .map(line => line.text)
                .join('\n');
        }

        // SAFETY GUARD: Check length limit for Google TTS (approx 5000 bytes, safe limit 4500 chars)
        if (fullText.length > 4500) {
            console.warn(`Audio script too long (${fullText.length} chars). Truncating to safe limit.`);

            // Truncate to 4500
            let safeText = fullText.substring(0, 4500);

            // Try to cut at the last sentence end to be polite
            const lastPeriod = safeText.lastIndexOf('.');
            if (lastPeriod > 0) {
                safeText = safeText.substring(0, lastPeriod + 1);
            }

            fullText = safeText;

            window.dispatchEvent(new CustomEvent('show-toast', {
                detail: { message: 'Scénář byl příliš dlouhý a byl zkrácen pro generování audia.', type: 'warning' }
            }));
        }

        this.isGeneratingAudio = true;
        try {
            const generateAudio = httpsCallable(functions, 'generatePodcastAudio');

            // Map frontend language to backend code
            // Simple mapping based on current UI language as a proxy for content
            const currentLang = document.documentElement.lang || 'cs';
            let targetLang = 'cs-CZ';
            if (currentLang.includes('en')) targetLang = 'en-US';
            if (currentLang.includes('pt')) targetLang = 'pt-br';

            const result = await generateAudio({
                lessonId: this.lesson.id,
                text: fullText,
                language: targetLang,
                voiceGender: this.voiceGender
            });

            if (result.data && result.data.audioUrl) {
                // Update lesson with new audio URL
                this.dispatchEvent(new CustomEvent('lesson-updated', {
                    detail: { partial: { podcast_audio_url: result.data.audioUrl } },
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
        const script = this._getScript();
        const hasContent = script.length > 0;
        const audioUrl = this.lesson?.podcast_audio_url;

        // Explicit Context Injection
        const aiContext = {
            subject: this.lesson?.subject || '',
            topic: this.lesson?.topic || '',
            title: this.lesson?.title || '',
            targetAudience: this.lesson?.targetAudience || ''
        };

        return html`
            <div class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                <div class="flex-1 overflow-hidden relative">
                    <div class="absolute inset-0 overflow-y-auto custom-scrollbar p-6">
                        <div class="max-w-5xl mx-auto space-y-6">

                            <!-- GLOBAL PODCAST CONTROLS (ALWAYS VISIBLE) -->
                            <div class="mb-6 flex flex-wrap items-center gap-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                <!-- Mode Toggle -->
                                <div class="flex items-center gap-3">
                                    <span class="text-sm font-medium text-slate-700">Režim:</span>
                                    <div class="flex bg-slate-100 p-1 rounded-lg">
                                        <button
                                            @click="${() => this.isDialogueMode = true}"
                                            class="px-3 py-1.5 text-sm font-medium rounded-md transition-all ${this.isDialogueMode ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}"
                                        >
                                            Dialog
                                        </button>
                                        <button
                                            @click="${() => this.isDialogueMode = false}"
                                            class="px-3 py-1.5 text-sm font-medium rounded-md transition-all ${!this.isDialogueMode ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}"
                                        >
                                            Monolog
                                        </button>
                                    </div>
                                </div>

                                <!-- Voice Gender (Only in Monologue) -->
                                ${!this.isDialogueMode ? html`
                                    <div class="flex items-center gap-3 animate-fade-in">
                                        <span class="text-sm font-medium text-slate-700">Hlas:</span>
                                        <select
                                            .value="${this.voiceGender}"
                                            @change="${e => this.voiceGender = e.target.value}"
                                            class="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2"
                                        >
                                            <option value="male">Mužský</option>
                                            <option value="female">Ženský</option>
                                        </select>
                                    </div>
                                ` : nothing}
                            </div>

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
                                                ${this.isDialogueMode ? html`
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
                                                ` : nothing}
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

                                    <div class="mt-8 pt-6 border-t border-slate-200 flex justify-center">
                                        <button
                                            @click="${this._handleDiscard}"
                                            class="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium flex items-center gap-2"
                                        >
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                            ${this.t('common.discard_restart') !== 'common.discard_restart' ? this.t('common.discard_restart') : 'Zahodit a začít znovu'}
                                        </button>
                                    </div>
                                </div>
                            ` : html`
                                <ai-generator-panel
                                    @ai-completion="${this._handleAiCompletion}"
                                    .lesson="${this.lesson}"
                                    .files="${this.files}"
                                    .context="${aiContext}"
                                    .extraData="${{ mode: this.isDialogueMode ? 'dialogue' : 'monologue', voice: this.voiceGender }}"
                                    viewTitle="${this.t('editor.audio.title')}"
                                    contentType="podcast"
                                    fieldToUpdate="podcast_script"
                                    description="${this.t('editor.audio.description')}"
                                    .inputsConfig=${[
                                        {
                                            id: 'topic',
                                            type: 'textarea',
                                            label: 'Téma podcastu',
                                            placeholder: 'O čem mají diskutovat?',
                                            default: this.lesson?.topic || ''
                                        },
                                        {
                                            id: 'episode_count',
                                            type: 'number',
                                            label: 'Počet epizod (aktuálně fixně 1)',
                                            default: 1,
                                            min: 1,
                                            max: 1
                                        }
                                    ]}
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
