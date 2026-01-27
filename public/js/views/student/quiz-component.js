// Súbor: public/js/student/quiz-component.js

// ==== ZMENA 1: Opravené importy na verziu, ktorá funguje priamo v prehliadači (pomocou skypack) ====
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
// ==============================================================================================

// Tieto importy sú v poriadku
import { showToast } from '../../utils/utils.js';
import * as firebaseInit from '../../firebase-init.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

// --- Logika pre Firebase Function (zostáva rovnaká) ---
let _submitQuizResultsCallable = null;
function getSubmitQuizResultsCallable() {
    if (!_submitQuizResultsCallable) {
        if (!firebaseInit.functions) {
            console.error("CRITICAL: Firebase Functions object is still not available when trying to create submitQuizResults callable!");
            throw new Error("Firebase Functions not initialized.");
        }
        _submitQuizResultsCallable = httpsCallable(firebaseInit.functions, 'submitQuizResults');
    }
    return _submitQuizResultsCallable;
}

let _generateRemedialExplanationCallable = null;
function getGenerateRemedialExplanationCallable() {
    if (!_generateRemedialExplanationCallable) {
        if (!firebaseInit.functions) {
            console.error("CRITICAL: Firebase Functions object is still not available when trying to create generateRemedialExplanation callable!");
            throw new Error("Firebase Functions not initialized.");
        }
        _generateRemedialExplanationCallable = httpsCallable(firebaseInit.functions, 'generateRemedialExplanation');
    }
    return _generateRemedialExplanationCallable;
}
// --- Koniec logiky ---


export class StudentQuiz extends LitElement {

    // ==== ZMENA 2: Odstránené @decorators a nahradené štandardnou definíciou vlastností ====
    static get properties() {
        return {
            // "props"
            quizData: { type: Object },
            lessonId: { type: String },
            
            // "state" (state: true znamená, že zmena prekreslí komponent)
            userAnswers: { type: Object, state: true },
            isSubmitted: { type: Boolean, state: true },
            score: { type: Number, state: true },

            // Adaptive Remediation
            remedialContent: { type: Object, state: true },
            isLoadingRemedial: { type: Boolean, state: true }
        };
    }

    // Inicializácia vlastností v konštruktore
    constructor() {
        super();
        this.quizData = null;
        this.lessonId = null;
        this.userAnswers = {};
        this.isSubmitted = false;
        this.score = 0;
        this.remedialContent = null;
        this.isLoadingRemedial = false;
    }
    // ====================================================================================


    // Hovoríme Lit, aby nerobilo Shadow DOM. Tým pádom náš komponent
    // automaticky zdedí Tailwind štýly z hlavnej stránky.
    createRenderRoot() {
        return this;
    }

    // Hlavná renderovacia metóda. Rozhoduje, čo zobraziť. (Zostáva rovnaká)
    render() {
        if (!this.quizData || !this.quizData.questions) {
            return html`<p>Obsah kvízu není k dispozici nebo není ve správném formátu.</p>`;
        }

        if (this.isSubmitted) {
            return this._renderResults();
        } else {
            return this._renderQuestions();
        }
    }

    // Súkromná metóda na zobrazenie otázok (Zostáva rovnaká)
    _renderQuestions() {
        const questions = this.quizData.questions || [];
        
        return html`
            <h3 class="text-xl md:text-2xl font-bold mb-4">${this.quizData.title || 'Kvíz'}</h3>
            
            ${questions.map((q, index) => html`
                <div class="mb-6 p-4 border border-gray-200 rounded-lg bg-white shadow-sm">
                    <p class="font-semibold mb-3 text-lg">${index + 1}. ${q.question_text || 'Chybějící text otázky'}</p>
                    
                    ${(q.options || []).map((option, optionIndex) => html`
                        <label class="block p-3 border border-gray-300 rounded-md mb-2 cursor-pointer hover:bg-slate-50 transition-colors">
                            <input 
                                type="radio" 
                                name="q${index}" 
                                .value=${option} 
                                class="mr-3 transform scale-110 text-green-600"
                                @change=${() => this._handleAnswerChange(index, option)}
                            >
                            ${option}
                        </label>
                    `)}
                </div>
            `)}
            
            <button 
                id="submit-quiz-btn" 
                @click=${this._handleSubmit}
                class="w-full bg-green-700 text-white font-bold py-3 px-4 rounded-lg text-lg hover:bg-green-800 transition-colors">
                Odevzdat kvíz
            </button>
        `;
    }

    // Súkromná metóda na zobrazenie výsledkov (Zostáva rovnaká)
    _renderResults() {
        const questions = this.quizData.questions || [];
        const scorePercentage = this.score / questions.length;
        const isFailed = scorePercentage < 0.5;

        return html`
            <div class="text-center p-6 mb-6 rounded-xl ${isFailed ? 'bg-red-600' : 'bg-green-700'} text-white shadow-lg">
                <h3 class="text-xl md:text-2xl font-bold">Váš konečný výsledek kvízu</h3>
                <p class="text-3xl md:text-4xl font-extrabold mt-2">${this.score} / ${questions.length}</p>
                ${isFailed
                    ? html`<p class="mt-2 font-bold text-yellow-200">Doporučujeme zopakovat si látku.</p>`
                    : html`<p class="mt-2 font-bold text-green-200">Skvělá práce!</p>`}
            </div>

            ${isFailed && !this.remedialContent && !this.isLoadingRemedial ? html`
                <div class="mb-8 text-center animate-pulse">
                     <button
                        @click=${this._handleRemedialRequest}
                        class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-full shadow-lg transform transition hover:scale-105 flex items-center justify-center mx-auto gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Nerozumím tomu - Vysvětli mi to (AI)
                    </button>
                    <p class="text-gray-500 text-sm mt-2">Umělá inteligence ti vysvětlí chyby a dá jednoduchý příklad.</p>
                </div>
            ` : ''}

            ${this.isLoadingRemedial ? html`
                 <div class="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-xl text-center">
                    <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                    <p class="text-blue-800 font-semibold">AI analyzuje tvé chyby a připravuje vysvětlení...</p>
                 </div>
            ` : ''}

            ${this.remedialContent ? this._renderRemedialContent() : ''}

            ${questions.map((q, index) => {
                const correctOptionIndex = q.correct_option_index;
                const correctOption = (typeof correctOptionIndex === 'number' && q.options && q.options[correctOptionIndex]) 
                                       ? q.options[correctOptionIndex] 
                                       : 'N/A (Chyba v datech)';
                const userAnswer = this.userAnswers[index];
                const isCorrect = userAnswer === correctOption;

                const userFeedbackText = isCorrect
                    ? html`<span class="text-green-600">✅ Správně!</span>`
                    : html`<span class="text-red-600">❌ Chyba. Správná odpověď: <strong>${correctOption}</strong></span>`;

                return html`
                    <div class="mb-6 p-4 border rounded-lg bg-white shadow-sm ${isCorrect ? 'border-green-500' : 'border-red-500'}">
                        <p class="font-semibold mb-3 text-lg">${index + 1}. ${q.question_text || 'Chybějící text otázky'}</p>
                        
                        ${(q.options || []).map((option, optionIndex) => {
                            let optionClass = 'block p-3 border border-gray-300 rounded-md mb-2 cursor-default opacity-70';
                            
                            if (optionIndex === correctOptionIndex) {
                                optionClass = 'block p-3 border border-green-500 rounded-md mb-2 bg-green-100 font-semibold';
                            } else if (option === userAnswer && !isCorrect) {
                                optionClass = 'block p-3 border border-red-500 rounded-md mb-2 bg-red-100 line-through';
                            }

                            return html`
                                <label class=${optionClass}>
                                    <input 
                                        type="radio" 
                                        name="q${index}" 
                                        .value=${option} 
                                        class="mr-3 transform scale-110 text-green-600"
                                        disabled
                                        .checked=${userAnswer === option}
                                    >
                                    ${option}
                                </label>
                            `
                        })}
                        <div class="mt-2 font-bold text-sm">${userFeedbackText}</div>
                    </div>
                `
            })}
        `;
    }

    // Handler pre zmenu odpovede (Zostáva rovnaká)
    _handleAnswerChange(questionIndex, selectedOption) {
        this.userAnswers = {
            ...this.userAnswers,
            [questionIndex]: selectedOption
        };
    }

    // Handler pre odovzdanie (Zostáva rovnaká)
    async _handleSubmit() {
        const totalQuestions = this.quizData.questions.length;
        const answeredQuestions = Object.keys(this.userAnswers).length;

        if (answeredQuestions < totalQuestions) {
            showToast("Prosím, odpovězte na všechny otázky!", true);
            return;
        }

        // 1. Vypočítame skóre
        let newScore = 0;
        const answersForBackend = [];

        this.quizData.questions.forEach((q, index) => {
            const correctOptionIndex = q.correct_option_index;
            const correctOption = (q.options && typeof correctOptionIndex === 'number') ? q.options[correctOptionIndex] : null;
            const userAnswer = this.userAnswers[index];
            
            if (userAnswer === correctOption) {
                newScore++;
            }
            
            answersForBackend.push({ question: q.question_text, answer: userAnswer });
        });

        // 2. Odošleme na backend
        try {
            const submitCallable = getSubmitQuizResultsCallable();
            await submitCallable({ 
                lessonId: this.lessonId, 
                quizTitle: this.quizData.title || 'Kvíz', 
                score: newScore / totalQuestions,
                totalQuestions: totalQuestions,
                answers: answersForBackend
            });
            showToast("Kvíz úspěšně odevzdán a vyhodnocen!");
        } catch (error) {
            showToast("Nepodařilo se odevzdat kvíz do databáze.", true);
            console.error("Error submitting quiz:", error);
        }

        // 3. Aktualizujeme stav, čím sa komponent automaticky prekreslí na výsledky
        this.score = newScore;
        this.isSubmitted = true;
    }

    async _handleRemedialRequest() {
        this.isLoadingRemedial = true;

        // 1. Identify failed questions
        const failedQuestions = [];
        this.quizData.questions.forEach((q, index) => {
             const correctOptionIndex = q.correct_option_index;
             const correctOption = (q.options && typeof correctOptionIndex === 'number') ? q.options[correctOptionIndex] : null;
             const userAnswer = this.userAnswers[index];

             if (userAnswer !== correctOption) {
                 failedQuestions.push(`Otázka: "${q.question_text}" - Tvoje odpověď: "${userAnswer || 'Neodpovězeno'}" (Správně: "${correctOption}")`);
             }
        });

        if (failedQuestions.length === 0) {
            // Should not happen if button is shown, but safety check
            this.isLoadingRemedial = false;
            showToast("Nemáš žádné chyby k vysvětlení!", true);
            return;
        }

        try {
            const generateRemedial = getGenerateRemedialExplanationCallable();
            const result = await generateRemedial({
                lessonTopic: this.quizData.title || "Unknown Topic",
                failedQuestions: failedQuestions
            });

            this.remedialContent = result.data;
        } catch (error) {
            console.error("Error generating remedial content:", error);
            showToast("Nepodařilo se vygenerovat vysvětlení. Zkus to prosím později.", true);
        } finally {
            this.isLoadingRemedial = false;
        }
    }

    _renderRemedialContent() {
        if (!this.remedialContent) return '';

        return html`
            <div class="mb-8 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-lg overflow-hidden relative">
                <!-- Glassmorphism header effect -->
                <div class="bg-white/40 backdrop-blur-md p-4 border-b border-white/50 flex items-center gap-2">
                    <span class="text-2xl">👨‍🏫</span>
                    <h3 class="font-bold text-lg text-blue-900">AI Doučování: Vysvětlení chyb</h3>
                </div>

                <div class="p-6 space-y-6">
                    <!-- 1. Explanation -->
                    <div>
                        <h4 class="font-bold text-blue-800 text-sm uppercase tracking-wide mb-2">JEDNODUCHÉ VYSVĚTLENÍ</h4>
                        <p class="text-gray-800 leading-relaxed bg-white p-4 rounded-lg shadow-sm border border-blue-100">
                            ${this.remedialContent.explanation}
                        </p>
                    </div>

                    <!-- 2. Analogy -->
                    <div class="flex gap-4 items-start">
                        <div class="text-3xl bg-yellow-100 p-2 rounded-full">💡</div>
                        <div class="flex-1">
                            <h4 class="font-bold text-yellow-800 text-sm uppercase tracking-wide mb-2">ANALOGIE PRO LEPŠÍ POCHOPENÍ</h4>
                            <p class="text-gray-800 italic">
                                "${this.remedialContent.analogy}"
                            </p>
                        </div>
                    </div>

                    <!-- 3. New Example -->
                    <div class="bg-green-50 p-4 rounded-lg border border-green-200">
                        <h4 class="font-bold text-green-800 text-sm uppercase tracking-wide mb-2">ZKUS SI TO ZNOVU (Příklad)</h4>
                        <p class="font-medium text-gray-900 mb-2">${this.remedialContent.newExample}</p>
                    </div>
                </div>

                <div class="bg-blue-100/50 p-3 text-center text-xs text-blue-600">
                    Vygenerováno na míru tvým chybám pomocí AI Sensei.
                </div>
            </div>
        `;
    }
}

// Zaregistrujeme komponent (Zostáva rovnaká)
customElements.define('student-quiz', StudentQuiz);
