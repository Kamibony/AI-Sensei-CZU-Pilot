// public/js/views/professor/editor/editor-view-quiz.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';
import './ai-generator-panel.js';
import './professor-header-editor.js';

export class EditorViewQuiz extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean },
        files: { type: Array }
    };

    createRenderRoot() { return this; }

    _getQuestions() {
        let questions = [];
        const raw = this.lesson?.quiz;

        // Defensive Normalization
        if (raw) {
            if (typeof raw === 'string') {
                try {
                    const parsed = JSON.parse(raw);
                    questions = parsed.questions || (Array.isArray(parsed) ? parsed : []);
                } catch (e) { console.warn("Failed to parse quiz", e); }
            } else if (Array.isArray(raw.questions)) {
                questions = raw.questions;
            } else if (Array.isArray(raw)) {
                // If the entire object is just the array of questions
                questions = raw;
            }
        }

        return JSON.parse(JSON.stringify(questions));
    }

    _dispatchUpdate(questions) {
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: {
                quiz: { ...this.lesson.quiz, questions: questions }
            },
            bubbles: true,
            composed: true
        }));
    }

    _handleQuestionChange(index, field, value) {
        const questions = this._getQuestions();
        if (questions[index]) {
            questions[index][field] = value;
            this._dispatchUpdate(questions);
        }
    }

    _handleOptionChange(qIndex, oIndex, value) {
        const questions = this._getQuestions();
        if (questions[qIndex] && questions[qIndex].options) {
            questions[qIndex].options[oIndex] = value;
            this._dispatchUpdate(questions);
        }
    }

    _addQuestion() {
        const questions = this._getQuestions();
        questions.push({
            question_text: '',
            options: ['', '', '', ''],
            correct_option_index: 0,
            type: 'Multiple Choice'
        });
        this._dispatchUpdate(questions);
    }

    _removeQuestion(index) {
        const questions = this._getQuestions();
        questions.splice(index, 1);
        this._dispatchUpdate(questions);
    }

    // --- Phase 2: Editor Standardization ---
    _handleAiCompletion(e) {
        const data = e.detail.data;
        if (!data) return;

        // 1. Normalize
        let questions = [];
        if (typeof data === 'object') {
             if (Array.isArray(data.questions)) questions = data.questions;
             else if (Array.isArray(data)) questions = data;
        } else if (typeof data === 'string') {
             try {
                 const parsed = JSON.parse(data);
                 if (parsed.questions) questions = parsed.questions;
                 else if (Array.isArray(parsed)) questions = parsed;
             } catch (e) { console.warn("AI Quiz Parse Error", e); }
        }

        // 3. Assign & 4. Save
        if (questions.length > 0) {
            if (!this.lesson.quiz) this.lesson.quiz = {};
            this.lesson.quiz.questions = questions;

            // Critical: Save immediately
            this._dispatchUpdate(questions);

            // 5. Refresh
            this.requestUpdate();
        }
    }

    _handleDiscard() {
        if (confirm(this.t('common.confirm_discard') || "Opravdu chcete zahodit veškerý obsah a začít znovu?")) {
            this.lesson.quiz.questions = [];
            this._dispatchUpdate([]);
            this.requestUpdate();
        }
    }

    render() {
        const quizConfig = [
            { 
                id: 'question_count',
                type: 'number', 
                label: this.t('editor.quiz.question_count'),
                default: 5,
                min: 1,
                max: 20
            },
            {
                id: 'difficulty_select',
                type: 'select',
                label: this.t('editor.quiz.difficulty'),
                options: [
                    { value: 'Lehká', label: this.t('editor.quiz.difficulty_easy') || 'Lehká' },
                    { value: 'Střední', label: this.t('editor.quiz.difficulty_medium') || 'Střední' },
                    { value: 'Těžká', label: this.t('editor.quiz.difficulty_hard') || 'Těžká' }
                ],
                default: 'Střední'
            }
        ];

        // Robust Data Access
        const questions = this._getQuestions();
        const hasContent = questions.length > 0;

        // Explicit Context Injection
        const aiContext = {
            subject: this.lesson?.subject || '',
            topic: this.lesson?.topic || '',
            title: this.lesson?.title || '',
            targetAudience: this.lesson?.targetAudience || ''
        };

        return html`
            <div data-tour="editor-quiz-start" class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>
                <div class="flex-1 overflow-hidden relative">
                    <div class="absolute inset-0 overflow-y-auto custom-scrollbar p-6">
                        <div class="max-w-5xl mx-auto space-y-8">

                            <!-- AI Generator Panel (Isolated) -->
                            <div class="relative">
                                <ai-generator-panel
                                    @ai-completion="${this._handleAiCompletion}"
                                    .lesson=${this.lesson}
                                    .files=${this.files}
                                    .context=${aiContext}
                                    viewTitle="${this.t('editor.quiz.title')}"
                                    contentType="quiz"
                                    fieldToUpdate="quiz"
                                    description="${this.t('editor.quiz.description')}"
                                    promptPlaceholder="${this.t('editor.quiz.placeholder')}"
                                    .inputsConfig=${quizConfig}
                                >
                                </ai-generator-panel>
                            </div>

                            <!-- Questions List (Isolated) -->
                            ${hasContent ? html`
                                <div class="space-y-6">
                                    ${questions.map((q, qIndex) => html`
                                        <div class="bg-white border border-slate-200 rounded-xl p-6 shadow-sm relative group transition-all hover:shadow-md">
                                            <div class="flex justify-between items-start mb-4">
                                                <div class="flex items-center gap-3 flex-1">
                                                    <span class="bg-teal-100 text-teal-700 font-bold rounded-lg w-8 h-8 flex items-center justify-center text-sm">
                                                        ${qIndex + 1}
                                                    </span>
                                                    <input
                                                        type="text"
                                                        .value="${q.question_text || ''}"
                                                        @input="${e => this._handleQuestionChange(qIndex, 'question_text', e.target.value)}"
                                                        class="w-full text-lg font-bold text-slate-800 bg-transparent border-b border-transparent focus:border-teal-500 focus:ring-0 p-1 transition-colors"
                                                        placeholder="${this.t('editor.quiz.question_placeholder') || 'Otázka...'}"
                                                    >
                                                </div>
                                                <button
                                                    @click="${() => this._removeQuestion(qIndex)}"
                                                    class="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                                                    title="${this.t('common.delete')}">
                                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                </button>
                                            </div>

                                            <div class="pl-11 space-y-3">
                                                ${q.options.map((opt, oIndex) => html`
                                                    <div class="flex items-center gap-3">
                                                        <input
                                                            type="radio"
                                                            name="correct-${qIndex}"
                                                            .checked="${(q.correct_option_index ?? q.correct) === oIndex}"
                                                            @change="${() => this._handleQuestionChange(qIndex, 'correct_option_index', oIndex)}"
                                                            class="w-4 h-4 text-teal-600 border-slate-300 focus:ring-teal-500 cursor-pointer"
                                                            title="${this.t('editor.quiz.mark_correct') || 'Označit jako správnou'}"
                                                        >
                                                        <input
                                                            type="text"
                                                            .value="${opt || ''}"
                                                            @input="${e => this._handleOptionChange(qIndex, oIndex, e.target.value)}"
                                                            class="flex-1 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                                                            placeholder="${this.t('editor.quiz.option_placeholder') || 'Možnost'} ${oIndex + 1}"
                                                        >
                                                    </div>
                                                `)}
                                            </div>
                                        </div>
                                    `)}

                                    <div class="text-center pt-4">
                                        <button
                                            @click="${this._addQuestion}"
                                            class="inline-flex items-center gap-2 px-6 py-2 bg-white border border-slate-300 rounded-full text-slate-600 hover:text-teal-600 hover:border-teal-600 hover:bg-teal-50 transition-all font-medium text-sm shadow-sm">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                                            ${this.t('editor.quiz.add_question') || 'Přidat otázku'}
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
                            ` : ''}

                            <div class="h-24"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-quiz', EditorViewQuiz);
