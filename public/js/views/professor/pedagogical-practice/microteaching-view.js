import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';
import { PracticeService } from '../../../services/practice-service.js';
import { auth } from '../../../firebase-init.js';

export class MicroteachingView extends Localized(LitElement) {
    static properties = {
        lessonId: { type: String }, // Can be passed from parent
        currentAnalysis: { type: Object },
        isLoading: { type: Boolean },
        openSections: { type: Object }, // Track open accordion sections
        analysisFeedback: { type: Object }, // Feedback from "Analyze Verb"
        isSaving: { type: Boolean },
        studentId: { type: String }
    };

    constructor() {
        super();
        this.practiceService = new PracticeService();
        this.lessonId = null;
        this.currentAnalysis = null;
        this.isLoading = false;
        this.openSections = { goals: true, flow: false, materials: false, personality: false };
        this.analysisFeedback = null;
        this.isSaving = false;
        this._saveDebounceTimer = null;

        // Define structure
        this.sections = [
            {
                id: 'goals',
                criteria: ['active_verbs', 'smart_goals']
            },
            {
                id: 'flow',
                criteria: ['structure_clear', 'intro_engaging', 'methods_varied', 'student_interaction']
            },
            {
                id: 'materials',
                criteria: ['tech_usage', 'materials_quality']
            },
            {
                id: 'personality',
                criteria: ['voice_modulation', 'nonverbal', 'feedback_given']
            }
        ];
    }

    createRenderRoot() { return this; }

    async connectedCallback() {
        super.connectedCallback();
        if (this.lessonId) {
            await this._loadAnalysis(this.lessonId);
        }
    }

    willUpdate(changedProperties) {
        if (changedProperties.has('lessonId') && this.lessonId) {
            this._loadAnalysis(this.lessonId);
        }
    }

    async _loadAnalysis(id) {
        this.isLoading = true;
        try {
            const data = await this.practiceService.getAnalysis(id);
            if (data) {
                this.currentAnalysis = data;
            } else {
                // If ID provided but not found, or maybe ID is just lesson ID and we need to find analysis for it?
                // For now, assume ID is the analysis ID.
                console.warn(`Analysis with ID ${id} not found.`);
                this.currentAnalysis = null;
            }
        } catch (e) {
            console.error("Failed to load analysis", e);
        } finally {
            this.isLoading = false;
        }
    }

    async _createAnalysis() {
        this.isLoading = true;
        try {
            const initialData = {
                criteria: {},
                goalFormulation: "",
                status: 'draft',
                studentId: this.studentId || auth.currentUser?.uid
            };
            const id = await this.practiceService.createAnalysis(initialData);
            this.lessonId = id; // Set ID
            this.currentAnalysis = { id, ...initialData };
        } catch (e) {
            console.error("Failed to create analysis", e);
        } finally {
            this.isLoading = false;
        }
    }

    _toggleSection(sectionId) {
        this.openSections = {
            ...this.openSections,
            [sectionId]: !this.openSections[sectionId]
        };
    }

    _updateCriterion(key, value) {
        if (!this.currentAnalysis) return;

        const criteria = {
            ...(this.currentAnalysis.criteria || {}),
            [key]: {
                ...(this.currentAnalysis.criteria?.[key] || {}),
                value: value
            }
        };

        this.currentAnalysis = { ...this.currentAnalysis, criteria };
        this._triggerAutoSave();
    }

    _updateComment(key, comment) {
        if (!this.currentAnalysis) return;

        const criteria = {
            ...(this.currentAnalysis.criteria || {}),
            [key]: {
                ...(this.currentAnalysis.criteria?.[key] || {}),
                comment: comment
            }
        };

        this.currentAnalysis = { ...this.currentAnalysis, criteria };
        this._triggerAutoSave();
    }

    _updateGoalFormulation(text) {
        this.currentAnalysis = { ...this.currentAnalysis, goalFormulation: text };
        this._triggerAutoSave();
    }

    _triggerAutoSave() {
        if (this._saveDebounceTimer) clearTimeout(this._saveDebounceTimer);
        this.isSaving = true;
        this._saveDebounceTimer = setTimeout(async () => {
            if (this.currentAnalysis && this.currentAnalysis.id) {
                try {
                    await this.practiceService.updateAnalysis(this.currentAnalysis.id, {
                        criteria: this.currentAnalysis.criteria,
                        goalFormulation: this.currentAnalysis.goalFormulation
                    });
                } catch (e) {
                    console.error("Auto-save failed", e);
                } finally {
                    this.isSaving = false;
                }
            }
        }, 1000);
    }

    _analyzeGoal() {
        if (!this.currentAnalysis || !this.currentAnalysis.goalFormulation) return;

        const result = this.practiceService.analyzeGoal(this.currentAnalysis.goalFormulation);
        this.analysisFeedback = result;
    }

    render() {
        if (this.isLoading) {
            return html`
                <div class="flex items-center justify-center h-64 text-slate-500">
                    ${this.t('microteaching.alerts.loading')}
                </div>
            `;
        }

        if (!this.currentAnalysis) {
            return this._renderEmptyState();
        }

        return html`
            <div class="max-w-4xl mx-auto p-6 space-y-6 pb-24">
                <!-- Header -->
                <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">${this.t('microteaching.title')}</h1>
                        <p class="text-slate-500">${this.t('microteaching.subtitle')}</p>
                    </div>
                    <div class="flex items-center gap-3">
                        ${this.isSaving ? html`
                            <span class="text-xs text-slate-400 animate-pulse">${this.t('common.saving')}</span>
                        ` : html`
                            <span class="text-xs text-green-600 font-medium">✓ ${this.t('common.saved')}</span>
                        `}
                    </div>
                </div>

                <!-- Sections -->
                ${this.sections.map(section => this._renderSection(section))}
            </div>
        `;
    }

    _renderEmptyState() {
        return html`
            <div class="p-6 bg-white rounded-xl shadow-sm border border-slate-200 h-full flex items-center justify-center">
                <div class="text-center py-12">
                    <div class="text-6xl mb-4">👩‍🏫</div>
                    <h2 class="text-2xl font-bold text-slate-800 mb-2">${this.t('microteaching.new_evaluation')}</h2>
                    <p class="text-slate-500 mb-6 max-w-lg mx-auto">
                        ${this.t('microteaching.empty_desc')}
                    </p>
                    <button
                        @click="${this._createAnalysis}"
                        class="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 mx-auto">
                        <span>➕</span> ${this.t('microteaching.start_btn')}
                    </button>
                </div>
            </div>
        `;
    }

    _renderSection(section) {
        const isOpen = this.openSections[section.id];
        return html`
            <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <button
                    @click="${() => this._toggleSection(section.id)}"
                    class="w-full flex justify-between items-center p-4 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
                    <h3 class="font-bold text-slate-700 text-lg">
                        ${this.t(`microteaching.sections.${section.id}`)}
                    </h3>
                    <span class="text-slate-400 transform transition-transform ${isOpen ? 'rotate-180' : ''}">
                        ▼
                    </span>
                </button>

                ${isOpen ? html`
                    <div class="p-4 border-t border-slate-100 space-y-6">
                        <!-- Bloom's Auditor (Only in Goals section) -->
                        ${section.id === 'goals' ? this._renderBloomsAuditor() : nothing}

                        <!-- Criteria List -->
                        <div class="space-y-4">
                            ${section.criteria.map(key => this._renderEvaluationItem(key))}
                        </div>
                    </div>
                ` : nothing}
            </div>
        `;
    }

    _renderBloomsAuditor() {
        return html`
            <div class="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-6">
                <label class="block text-sm font-medium text-indigo-900 mb-2">
                    ${this.t('microteaching.labels.goal_formulation')}
                </label>
                <div class="flex gap-2 items-start">
                    <textarea
                        .value="${this.currentAnalysis.goalFormulation || ''}"
                        @input="${e => this._updateGoalFormulation(e.target.value)}"
                        class="flex-1 rounded-lg border-indigo-200 focus:border-indigo-500 focus:ring-indigo-500 text-sm min-h-[80px]"
                        placeholder="Žák bude schopen..."></textarea>
                    <button
                        @click="${this._analyzeGoal}"
                        class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 whitespace-nowrap">
                        ${this.t('microteaching.labels.analyze_verb_btn')}
                    </button>
                </div>

                ${this.analysisFeedback ? html`
                    <div class="mt-3 text-sm p-3 rounded bg-white border ${this.analysisFeedback.valid ? 'border-green-200 text-green-700' : 'border-amber-200 text-amber-700'}">
                        <div class="flex items-center gap-2 font-bold mb-1">
                            ${this.analysisFeedback.valid ? '✅' : '⚠️'}
                            ${this.analysisFeedback.valid ? this.t('microteaching.alerts.analysis_valid') : this.t('microteaching.alerts.passive_verb_warning')}
                        </div>
                        <p>${this.analysisFeedback.feedback}</p>
                    </div>
                ` : nothing}
            </div>
        `;
    }

    _renderEvaluationItem(key) {
        const itemData = this.currentAnalysis.criteria?.[key] || { value: null, comment: '' };
        const showComment = !!itemData.comment || itemData.showCommentInput;

        return html`
            <div class="border-b border-slate-100 last:border-0 pb-4 last:pb-0">
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div class="flex-1">
                        <span class="text-slate-700 font-medium">${this.t(`microteaching.criteria.${key}`)}</span>
                    </div>

                    <div class="flex items-center gap-3">
                        <!-- Segmented Control -->
                        <div class="flex bg-slate-100 rounded-lg p-1">
                            ${this._renderSegmentOption(key, 'yes', '✅', itemData.value)}
                            ${this._renderSegmentOption(key, 'partial', '⚠️', itemData.value)}
                            ${this._renderSegmentOption(key, 'no', '❌', itemData.value)}
                            ${this._renderSegmentOption(key, 'na', '⚪', itemData.value)}
                        </div>

                        <!-- Comment Toggle -->
                        <button
                            @click="${() => {
                                // Toggle local UI state for comment input visibility if empty
                                // Ideally we should store this in local state but modifying data object works for persistence too
                                // Or better: just assume if comment exists show it, else toggle.
                                // We'll just focus the input if it exists or show it.
                                const newItemData = { ...itemData, showCommentInput: !showComment };
                                const criteria = { ...this.currentAnalysis.criteria, [key]: newItemData };
                                this.currentAnalysis = { ...this.currentAnalysis, criteria };
                            }}"
                            class="text-slate-400 hover:text-indigo-600 p-2 rounded-full hover:bg-indigo-50 transition-colors"
                            title="Přidat poznámku">
                            💬
                        </button>
                    </div>
                </div>

                ${showComment ? html`
                    <div class="mt-3 pl-4 border-l-2 border-indigo-100">
                        <input
                            type="text"
                            .value="${itemData.comment || ''}"
                            @change="${e => this._updateComment(key, e.target.value)}"
                            class="w-full text-sm border-0 border-b border-slate-200 focus:border-indigo-500 focus:ring-0 px-0 py-1 bg-transparent placeholder-slate-400"
                            placeholder="${this.t('microteaching.labels.comment_placeholder')}">
                    </div>
                ` : nothing}
            </div>
        `;
    }

    _renderSegmentOption(key, value, icon, currentValue) {
        const isSelected = currentValue === value;
        const classes = isSelected
            ? 'bg-white text-slate-900 shadow-sm font-bold'
            : 'text-slate-500 hover:bg-slate-200';

        // Tooltip text
        const label = this.t(`microteaching.status.${value}`);

        return html`
            <button
                @click="${() => this._updateCriterion(key, value)}"
                class="${classes} px-3 py-1.5 rounded-md text-sm transition-all flex items-center gap-1"
                title="${label}">
                <span>${icon}</span>
                <span class="hidden sm:inline">${label}</span>
            </button>
        `;
    }
}

customElements.define('microteaching-view', MicroteachingView);
