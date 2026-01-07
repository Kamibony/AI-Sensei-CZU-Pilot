// Súbor: public/js/student/test-component.js

import { LitElement, html } from 'https://cdn.skypack.dev/lit';
import { showToast } from '../../utils/utils.js';
import * as firebaseInit from '../firebase-init.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

// --- Sem presúvame logiku pre Firebase Function ---
let _submitTestResultsCallable = null;
function getSubmitTestResultsCallable() {
    if (!_submitTestResultsCallable) {
        if (!firebaseInit.functions) {
            console.error("CRITICAL: Firebase Functions object is still not available when trying to create submitTestResults callable!");
            throw new Error("Firebase Functions not initialized.");
        }
        _submitTestResultsCallable = httpsCallable(firebaseInit.functions, 'submitTestResults');
    }
    return _submitTestResultsCallable;
}
// --- Koniec presunutej logiky ---


export class StudentTest extends LitElement {

    // Definujeme vlastnosti (props & state)
    static get properties() {
        return {
            testData: { type: Object },
            lessonId: { type: String },
            userAnswers: { type: Object, state: true },
            isSubmitted: { type: Boolean, state: true },
            score: { type: Number, state: true }
        };
    }

    // Inicializácia vlastností
    constructor() {
        super();
        this.testData = null;
        this.lessonId = null;
        this.userAnswers = {};
        this.isSubmitted = false;
        this.score = 0;
    }

    // Vypnutie Shadow DOM, aby sme dedili Tailwind štýly
    createRenderRoot() {
        return this;
    }

    // Hlavná renderovacia metóda
    render() {
        if (!this.testData || !this.testData.questions) {
            return html`<p>Obsah testu není k dispozici nebo není ve správném formátu.</p>`;
        }

        if (this.isSubmitted) {
            return this._renderResults();
        } else {
            return this._renderQuestions();
        }
    }

    // Súkromná metóda na zobrazenie otázok (pôvodný `renderTest` - časť 1)
    _renderQuestions() {
        const questions = this.testData.questions || [];
        
        return html`
            <h3 class="text-xl md:text-2xl font-bold mb-4">${this.testData.title || 'Test'}</h3>
            <p class="text-slate-600 mb-6">Odpovězte na všechny otázky. Výsledky testu se započítají do vašeho hodnocení.</p>
            
            ${questions.map((q, index) => html`
                <div class="mb-6 p-4 border border-gray-200 rounded-lg bg-white shadow-sm">
                    <p class="font-semibold mb-3 text-lg">${index + 1}. ${q.question_text || 'Chybějící text otázky'}</p>
                    
                    ${(q.options || []).map((option, optionIndex) => html`
                        <label class="block p-3 border border-gray-300 rounded-md mb-2 cursor-pointer hover:bg-slate-50 transition-colors">
                            <input 
                                type="radio" 
                                name="t${index}" 
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
                id="submit-test-btn" 
                @click=${this._handleSubmit}
                class="w-full bg-green-700 text-white font-bold py-3 px-4 rounded-lg text-lg hover:bg-green-800 transition-colors">
                Odevzdat test
            </button>
        `;
    }

    // Súkromná metóda na zobrazenie výsledkov (pôvodný `displayTestResults`)
    _renderResults() {
        const questions = this.testData.questions || [];

        return html`
            <div class="text-center p-6 mb-6 rounded-xl bg-green-700 text-white shadow-lg">
                <h3 class="text-xl md:text-2xl font-bold">Váš konečný výsledek testu</h3>
                <p class="text-3xl md:text-4xl font-extrabold mt-2">${this.score} / ${questions.length}</p>
            </div>

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
                                        name="t${index}" 
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

    // Handler pre zmenu odpovede
    _handleAnswerChange(questionIndex, selectedOption) {
        this.userAnswers = {
            ...this.userAnswers,
            [questionIndex]: selectedOption
        };
    }

    // Handler pre odovzdanie (pôvodná logika z `renderTest` listenera)
    async _handleSubmit() {
        const totalQuestions = this.testData.questions.length;
        const answeredQuestions = Object.keys(this.userAnswers).length;

        if (answeredQuestions < totalQuestions) {
            showToast("Prosím, odpovězte na všechny otázky!", true);
            return;
        }

        // 1. Vypočítame skóre (logika z `displayTestResults`)
        let newScore = 0;
        const answersForBackend = [];

        this.testData.questions.forEach((q, index) => {
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
            const submitCallable = getSubmitTestResultsCallable();
            await submitCallable({ 
                lessonId: this.lessonId, 
                testTitle: this.testData.title || 'Test', 
                score: newScore / totalQuestions,
                totalQuestions: totalQuestions,
                answers: answersForBackend
            });
            showToast("Test úspěšně odevzdán a vyhodnocen!");
        } catch (error) {
            showToast("Nepodařilo se odevzdat test do databáze.", true);
            console.error("Error submitting test:", error);
        }

        // 3. Aktualizujeme stav, čím sa komponent automaticky prekreslí na výsledky
        this.score = newScore;
        this.isSubmitted = true;
    }
}

// Zaregistrujeme komponent
customElements.define('student-test', StudentTest);
