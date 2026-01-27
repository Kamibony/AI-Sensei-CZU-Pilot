import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils/utils.js';
import { Localized } from '../../utils/localization-mixin.js';

export class AdminSettingsView extends Localized(LitElement) {
    static properties = {
        _settings: { state: true, type: Object },
        _isLoading: { state: true, type: Boolean },
    };

    constructor() {
        super();
        this._settings = {
            magic_presentation_slides: 8,
            magic_text_rules: "Rozsah 300 slov. Rozdělte text do logických odstavců. Používejte nadpisy pro lepší orientaci.",
            magic_test_questions: 10,
            magic_quiz_questions: 5,
            magic_flashcard_count: 10,
            system_prompt: "" // Default system instruction
        };
        this._isLoading = true;
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._fetchSettings();
    }

    async _fetchSettings() {
        this._isLoading = true;
        try {
            const docRef = doc(firebaseInit.db, 'system_settings', 'ai_config');
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                this._settings = { ...this._settings, ...docSnap.data() };
            }
        } catch (error) {
            console.error("Error fetching AI config:", error);
            showToast(this.t('admin.settings.toast_load_error'), true);
        } finally {
            this._isLoading = false;
        }
    }

    _handleInputChange(e) {
        const field = e.target.name;
        let value = e.target.value;

        if (e.target.type === 'number') {
            value = parseInt(value, 10);
        }

        this._settings = {
            ...this._settings,
            [field]: value
        };
    }

    async _saveSettings() {
        this._isLoading = true;
        try {
            const docRef = doc(firebaseInit.db, 'system_settings', 'ai_config');
            await setDoc(docRef, this._settings);
            showToast(this.t('admin.settings.toast_save_success'));
        } catch (error) {
            console.error("Error saving AI config:", error);
            showToast(this.t('admin.settings.toast_save_error'), true);
        } finally {
            this._isLoading = false;
        }
    }

    render() {
        if (this._isLoading) {
            return html`
                <div data-tour="admin-settings-start" class="flex items-center justify-center h-full">
                    <div class="text-slate-500">${this.t('common.loading')}</div>
                </div>
            `;
        }

        return html`
            <div class="h-full flex flex-col bg-slate-50 overflow-hidden">
                <header class="p-6 border-b border-slate-200 bg-white flex-shrink-0">
                    <h1 class="text-2xl font-bold text-slate-800">${this.t('admin.settings.title')}</h1>
                    <p class="text-slate-500 mt-1">${this.t('admin.settings.subtitle')}</p>
                </header>

                <div class="flex-grow overflow-y-auto p-6">
                    <div class="max-w-3xl mx-auto space-y-8">

                        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <h2 class="text-lg font-semibold text-slate-800 mb-4 flex items-center">
                                <span class="bg-indigo-100 text-indigo-600 p-2 rounded-lg mr-3">🤖</span>
                                System Prompt (Global)
                            </h2>
                            <div class="space-y-4">
                                <div>
                                    <label class="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                                        System Instruction
                                    </label>
                                    <textarea
                                           name="system_prompt"
                                           .value=${this._settings.system_prompt || ""}
                                           @input=${this._handleInputChange}
                                           rows="3"
                                           placeholder="You are a strict educational assistant..."
                                           class="w-full rounded-xl border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"></textarea>
                                    <p class="text-xs text-slate-500 mt-1">This overrides the default system instruction for all AI operations.</p>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <h2 class="text-lg font-semibold text-slate-800 mb-4 flex items-center">
                                <span class="bg-indigo-100 text-indigo-600 p-2 rounded-lg mr-3">📊</span>
                                ${this.t('admin.settings.presentation_section')}
                            </h2>
                            <div class="space-y-4">
                                <div>
                                    <label class="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                                        <span>📊</span> ${this.t('admin.settings.slides_label')}
                                    </label>
                                    <input type="number"
                                           name="magic_presentation_slides"
                                           .value=${this._settings.magic_presentation_slides}
                                           @input=${this._handleInputChange}
                                           min="1" max="20"
                                           class="w-full rounded-xl border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                    <div class="flex items-start gap-2 mt-1">
                                        <span class="text-xs">ℹ️</span>
                                        <p class="text-xs text-slate-500">${this.t('admin.settings.slides_help')}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <h2 class="text-lg font-semibold text-slate-800 mb-4 flex items-center">
                                <span class="bg-blue-100 text-blue-600 p-2 rounded-lg mr-3">📝</span>
                                ${this.t('admin.settings.text_section')}
                            </h2>
                            <div class="space-y-4">
                                <div>
                                    <label class="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                                        <span>📝</span> ${this.t('admin.settings.text_instructions_label')}
                                    </label>
                                    <textarea
                                           name="magic_text_rules"
                                           .value=${this._settings.magic_text_rules}
                                           @input=${this._handleInputChange}
                                           rows="4"
                                           class="w-full rounded-xl border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"></textarea>
                                    <p class="text-xs text-slate-500 mt-1">${this.t('admin.settings.text_instructions_help')}</p>
                                </div>
                            </div>
                        </div>

                        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <h2 class="text-lg font-semibold text-slate-800 mb-4 flex items-center">
                                <span class="bg-green-100 text-green-600 p-2 rounded-lg mr-3">✅</span>
                                Content Limits (Magic Gen)
                            </h2>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-slate-700 mb-1">Test Questions</label>
                                    <input type="number"
                                           name="magic_test_questions"
                                           .value=${this._settings.magic_test_questions}
                                           @input=${this._handleInputChange}
                                           min="1" max="50"
                                           class="w-full rounded-xl border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-slate-700 mb-1">Quiz Questions</label>
                                    <input type="number"
                                           name="magic_quiz_questions"
                                           .value=${this._settings.magic_quiz_questions}
                                           @input=${this._handleInputChange}
                                           min="1" max="20"
                                           class="w-full rounded-xl border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-slate-700 mb-1">Flashcards</label>
                                    <input type="number"
                                           name="magic_flashcard_count"
                                           .value=${this._settings.magic_flashcard_count}
                                           @input=${this._handleInputChange}
                                           min="1" max="30"
                                           class="w-full rounded-xl border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500">
                                </div>
                            </div>
                        </div>

                        <div class="flex justify-end pt-4">
                            <button @click=${this._saveSettings}
                                    class="bg-indigo-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">
                                ${this.t('admin.settings.save_btn')}
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('admin-settings-view', AdminSettingsView);
