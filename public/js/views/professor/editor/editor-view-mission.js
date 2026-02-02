import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { translationService } from '../../../utils/translation-service.js';
import { showToast } from '../../../utils/utils.js';

export class EditorViewMission extends LitElement {
    static properties = {
        lesson: { type: Object },
        files: { type: Array },
        isSaving: { type: Boolean },
        _isGenerating: { state: true }
    };

    constructor() {
        super();
        this._isGenerating = false;
    }

    createRenderRoot() { return this; }

    async _handleCreateMission() {
        this._isGenerating = true;
        this.requestUpdate();

        // Simulate async API call to "AI Architect"
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Mock response
        const missionConfig = {
            active: true,
            status: 'active',
            createdAt: new Date().toISOString(),
        };

        const updates = {
            mission_config: missionConfig
        };

        // Emit update
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: updates,
            bubbles: true,
            composed: true
        }));

        // Trigger save
        this.dispatchEvent(new CustomEvent('save', {
            bubbles: true,
            composed: true
        }));

        this._isGenerating = false;
        showToast(translationService.t('common.success'));
        this.requestUpdate();
    }

    render() {
        const hasMission = this.lesson?.mission_config?.active;

        return html`
            <div class="h-full flex flex-col">
                <div class="flex items-center justify-between p-6 border-b border-slate-200 bg-white">
                    <div class="flex items-center gap-4">
                        <button @click="${() => this.dispatchEvent(new CustomEvent('back'))}"
                                class="p-2 -ml-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-full transition-colors">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                        </button>
                        <div>
                            <h2 class="text-xl font-bold text-slate-800">${translationService.t('editor.tabs.mission')}</h2>
                        </div>
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto p-8">
                    <div class="max-w-2xl mx-auto space-y-8">

                        <div class="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center space-y-6">
                            <div class="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto">
                                <span class="text-4xl">🚀</span>
                            </div>

                            <div>
                                <h3 class="text-xl font-bold text-slate-800 mb-2">
                                    ${hasMission ? translationService.t('mission.status_active') : translationService.t('editor.tabs.mission')}
                                </h3>
                                <p class="text-slate-500">
                                    ${hasMission
                                        ? translationService.t('mission.professor_running')
                                        : translationService.t('mission.professor_create_desc')}
                                </p>
                            </div>

                            ${this._isGenerating ? html`
                                <div class="flex justify-center p-4">
                                     <div class="spinner w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            ` : html`
                                <button @click="${this._handleCreateMission}"
                                    class="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                                    ${hasMission ? translationService.t('mission.regenerate') : translationService.t('mission.create_title')}
                                </button>
                            `}
                        </div>

                        ${hasMission ? html`
                            <div class="bg-emerald-50 rounded-xl p-4 border border-emerald-100 flex items-start gap-3">
                                <span class="text-2xl">✅</span>
                                <div>
                                    <h4 class="font-bold text-emerald-800">${translationService.t('mission.status_active')}</h4>
                                    <p class="text-sm text-emerald-600 mt-1">${translationService.t('mission.professor_active_desc')}</p>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-mission', EditorViewMission);
