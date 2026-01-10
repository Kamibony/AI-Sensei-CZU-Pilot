import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';
import './professor-header-editor.js';
import './ai-generator-panel.js';

export class EditorViewAudio extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean }
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

    render() {
        const rawScript = this.lesson?.podcast_script;
        const script = Array.isArray(rawScript) ? rawScript : [];
        const hasContent = script.length > 0;

        return html`
            <div class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                <div class="flex-1 overflow-hidden relative">
                    <div class="absolute inset-0 overflow-y-auto custom-scrollbar p-6">
                        <div class="max-w-5xl mx-auto space-y-6">

                            ${hasContent ? html`
                                <div class="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 md:p-8">
                                    <div class="flex justify-between items-center mb-6">
                                        <div>
                                            <h2 class="text-2xl font-bold text-slate-800">${this.t('editor.audio.title')}</h2>
                                            <p class="text-slate-500">${this.t('editor.audio.subtitle')}</p>
                                        </div>
                                    </div>

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
