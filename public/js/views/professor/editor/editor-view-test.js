// public/js/views/professor/editor/editor-view-test.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';
import './ai-generator-panel.js';
import './professor-header-editor.js';

export class EditorViewTest extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean },
        files: { type: Array }
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.lesson = {};
    }

    _handleQuestionChange(index, field, value) {
        // Create deep copy from test.questions OR content.questions if test missing (legacy fallback)
        const questions = this._getQuestions();

        if (!questions[index]) {
            questions[index] = { question_text: '', options: ['', '', '', ''], correct_option_index: 0, type: 'Multiple Choice' };
        }

        questions[index][field] = value;

        this._dispatchUpdate(questions);
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
             } catch (e) { console.warn("AI Test Parse Error", e); }
        }

        // 3. Assign & 4. Save
        if (questions.length > 0) {
            // Update local state first
            this.lesson.test = questions;

            // Critical: Save immediately
            this._dispatchUpdate(questions);

            // 5. Refresh
            this.requestUpdate();
        }
    }

    _getQuestions() {
        let questions = [];

        // 1. Check 'test' property (Defensive Normalization)
        let rawTest = this.lesson?.test;

        if (rawTest) {
             if (typeof rawTest === 'string') {
                 try {
                     const parsed = JSON.parse(rawTest);
                     // Polymorphic handling: Array or Object with questions
                     if (Array.isArray(parsed)) rawTest = parsed;
                     else if (parsed.questions && Array.isArray(parsed.questions)) rawTest = parsed.questions;
                     else if (parsed.test && Array.isArray(parsed.test)) rawTest = parsed.test;
                 } catch(e) { console.warn("Failed to parse test data", e); }
             }

             if (Array.isArray(rawTest)) {
                 questions = rawTest;
             } else if (rawTest && rawTest.questions && Array.isArray(rawTest.questions)) {
                 questions = rawTest.questions;
             }
        }

        // 2. Fallback to 'content.questions' (Legacy)
        if (questions.length === 0 && this.lesson?.content?.questions && Array.isArray(this.lesson.content.questions)) {
            questions = this.lesson.content.questions;
        }

        return JSON.parse(JSON.stringify(questions));
    }

    _dispatchUpdate(questions) {
        // IMPORTANT: Dispatched as a flat array to 'test' key, matching new backend structure
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: {
                test: questions
            },
            bubbles: true,
            composed: true
        }));
    }

    render() {
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
            <div data-tour="editor-test-start" class="h-full flex flex-col bg-slate-100 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>

                <!-- Scrollable Content Area -->
                <div class="flex-1 overflow-hidden relative">
                    <div class="absolute inset-0 overflow-y-auto custom-scrollbar p-8">
                        <div class="max-w-4xl mx-auto space-y-8">

                            <!-- Paper & Desk Container -->
                            <div class="bg-white shadow-2xl relative min-h-[800px] flex flex-col" style="box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.2);">

                                <!-- Formal Exam Header -->
                                <div class="border-b-2 border-slate-900 p-12 pb-8 mb-8 text-center">
                                    <div class="uppercase tracking-widest text-slate-500 text-sm font-bold mb-2">${this.t('editor.test.paper_header')}</div>
                                    <h1 class="text-4xl font-serif text-slate-900 mb-4">${this.lesson.title || this.t('editor.test.untitled')}</h1>
                                    <div class="flex justify-center gap-8 text-sm font-serif italic text-slate-600">
                                        <span>${this.t('editor.test.subject')}: ${this.lesson.subject || this.t('common.no_subject')}</span>
                                        <span>•</span>
                                        <span>${this.t('editor.test.topic')}: ${this.lesson.topic || this.t('common.no_topic')}</span>
                                        <span>•</span>
                                        <span>${this.t('editor.test.questions_count')}: ${questions.length}</span>
                                    </div>
                                </div>

                                <!-- Content Padding -->
                                <div class="px-12 pb-12 flex-1 space-y-12">

                                    <!-- AI Generator (Styled Formally) -->
                                    <div class="border border-slate-200 bg-slate-50 p-6">
                                        <ai-generator-panel
                                            @ai-completion="${this._handleAiCompletion}"
                                            .lesson=${this.lesson}
                                            .files=${this.files}
                                            .context=${aiContext}
                                            viewTitle="${this.t('editor.test.ai_title')}"
                                            contentType="test"
                                            fieldToUpdate="test"
                                            description="${this.t('editor.test.ai_description')}"
                                            promptPlaceholder="${this.t('editor.test.ai_placeholder')}"
                                            .extraParams=${{question_count: 5}}>

                                            <div slot="ai-inputs" class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4 font-serif">
                                                <div>
                                                    <label class="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">${this.t('editor.test.question_count')}</label>
                                                    <input id="question-count-input" type="number" class="w-full border-slate-300 focus:border-slate-800 focus:ring-0 rounded-none p-2 bg-white" value="5">
                                                </div>
                                                <div>
                                                    <label class="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">${this.t('editor.test.difficulty')}</label>
                                                    <select id="difficulty-select" class="w-full border-slate-300 focus:border-slate-800 focus:ring-0 rounded-none p-2 bg-white">
                                                        <option value="Lehká">${this.t('editor.quiz.difficulty_easy') || 'Lehká'}</option>
                                                        <option value="Střední" selected>${this.t('editor.quiz.difficulty_medium') || 'Střední'}</option>
                                                        <option value="Těžká">${this.t('editor.quiz.difficulty_hard') || 'Těžká'}</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label class="block text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">${this.t('editor.test.question_type')}</label>
                                                    <select id="type-select" class="w-full border-slate-300 focus:border-slate-800 focus:ring-0 rounded-none p-2 bg-white">
                                                        <option value="Mix">${this.t('editor.test.type_mix')}</option>
                                                        <option value="Multiple Choice">${this.t('editor.test.type_mc')}</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </ai-generator-panel>
                                    </div>

                                    <!-- Questions List -->
                                    ${hasContent ? html`
                                        <div class="space-y-12">
                                            ${questions.map((q, qIndex) => html`
                                                <div class="relative group">
                                                    <!-- Question Number & Text -->
                                                    <div class="flex gap-4 mb-4 items-start">
                                                        <span class="font-serif font-bold text-slate-900 text-lg mt-1">${qIndex + 1}.</span>
                                                        <div class="flex-1">
                                                            <input
                                                                type="text"
                                                                .value="${q.question_text || q.question}"
                                                                @input="${e => this._handleQuestionChange(qIndex, 'question_text', e.target.value)}"
                                                                class="w-full font-serif text-lg text-slate-900 border-b border-dashed border-slate-300 focus:border-slate-900 focus:ring-0 p-1 bg-transparent placeholder-slate-400"
                                                                placeholder="${this.t('editor.test.question_placeholder')}"
                                                            >
                                                        </div>
                                                        <button
                                                            @click="${() => this._removeQuestion(qIndex)}"
                                                            class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 transition-colors p-1"
                                                            title="${this.t('editor.test.delete_question')}"
                                                        >
                                                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                        </button>
                                                    </div>

                                                    <!-- Options (A, B, C...) -->
                                                    <div class="pl-10 space-y-3">
                                                        ${q.options.map((opt, oIndex) => html`
                                                            <div class="flex items-center gap-3">
                                                                <div class="w-6 h-6 flex items-center justify-center border border-slate-300 rounded-full text-xs font-serif text-slate-500">
                                                                    ${String.fromCharCode(65 + oIndex)}
                                                                </div>
                                                                <input
                                                                    type="radio"
                                                                    name="correct-${qIndex}"
                                                                    .checked="${(q.correct_option_index ?? q.correct) === oIndex}"
                                                                    @change="${() => this._handleQuestionChange(qIndex, 'correct_option_index', oIndex)}"
                                                                    class="w-4 h-4 text-slate-800 border-slate-400 focus:ring-slate-800 cursor-pointer"
                                                                >
                                                                <input
                                                                    type="text"
                                                                    .value="${opt}"
                                                                    @input="${e => this._handleOptionChange(qIndex, oIndex, e.target.value)}"
                                                                    class="flex-1 font-serif text-slate-700 bg-transparent border-b border-transparent focus:border-slate-300 focus:ring-0 p-1 text-sm placeholder-slate-300"
                                                                    placeholder="${this.t('editor.test.option_placeholder')} ${String.fromCharCode(65 + oIndex)}"
                                                                >
                                                            </div>
                                                        `)}
                                                    </div>
                                                </div>
                                            `)}
                                        </div>

                                        <!-- Add Question Button (Formal) -->
                                        <div class="mt-12 pt-8 border-t border-slate-100 text-center">
                                            <button
                                                @click="${this._addQuestion}"
                                                class="inline-flex items-center gap-2 px-6 py-2 border border-slate-300 text-slate-600 font-serif hover:border-slate-800 hover:text-slate-900 transition-all uppercase tracking-wider text-xs"
                                            >
                                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4"></path></svg>
                                                ${this.t('editor.test.add_question')}
                                            </button>
                                        </div>
                                    ` : ''}

                                </div>

                                <!-- Footer decor -->
                                <div class="h-4 bg-slate-100 border-t border-slate-200"></div>
                            </div>

                            <!-- Bottom Spacer -->
                            <div class="h-24"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-test', EditorViewTest);
