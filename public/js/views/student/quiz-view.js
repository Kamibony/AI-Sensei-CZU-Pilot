export function renderQuiz(lessonData, container, submitQuizResults, showToast, currentLessonId) {
    const quizData = lessonData.quizData;
    if (!quizData || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
        container.innerHTML = `<p class="text-center text-slate-500 p-8">Pro tuto lekci není k dispozici žádný kvíz.</p>`; return;
    }
    const questionsHtml = quizData.questions.map((q, index) => {
        const optionsHtml = (q.options || []).map((option, i) => `<label class="block p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"><input type="radio" name="question-${index}" value="${i}" class="mr-3"><span>${option}</span></label>`).join('');
        return `<div class="bg-slate-50 p-4 md:p-6 rounded-lg border border-slate-200 mb-6" data-q-index="${index}"><p class="font-semibold text-base md:text-lg mb-4">${index + 1}. ${q.question_text}</p><div class="space-y-3">${optionsHtml}</div><div class="mt-4 p-3 rounded-lg text-sm hidden result-feedback"></div></div>`;
    }).join('');
    container.innerHTML = `<h2 class="text-2xl md:text-3xl font-extrabold text-slate-800 mb-6 text-center">Interaktivní Kvíz</h2><form id="quiz-form">${questionsHtml}</form><div class="text-center mt-6"><button id="check-quiz-btn" class="bg-green-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-green-700">Vyhodnotit</button></div><div id="quiz-summary" class="hidden mt-8 text-center font-bold text-xl p-4 rounded-lg"></div>`;

    document.getElementById('check-quiz-btn').addEventListener('click', async (e) => {
        e.preventDefault();

        let score = 0;
        const studentAnswers = [];

        quizData.questions.forEach((q, index) => {
            const qEl = container.querySelector(`[data-q-index="${index}"]`);
            const feedbackEl = qEl.querySelector('.result-feedback');
            const selectedRadio = qEl.querySelector('input:checked');

            const selectedOptionIndex = selectedRadio ? parseInt(selectedRadio.value) : -1;
            const isCorrect = selectedOptionIndex === q.correct_option_index;

            studentAnswers.push({
                questionText: q.question_text,
                selectedOptionIndex: selectedOptionIndex,
                correctOptionIndex: q.correct_option_index,
                isCorrect: isCorrect
            });

            feedbackEl.classList.remove('hidden');
            if (selectedRadio) {
                if (isCorrect) {
                    score++;
                    feedbackEl.textContent = 'Správně!';
                    feedbackEl.className = 'mt-4 p-3 rounded-lg text-sm bg-green-100 text-green-700 result-feedback';
                } else {
                    feedbackEl.textContent = `Špatně. Správná odpověď: ${q.options[q.correct_option_index]}`;
                    feedbackEl.className = 'mt-4 p-3 rounded-lg text-sm bg-red-100 text-red-700 result-feedback';
                }
            } else {
                feedbackEl.textContent = 'Nevybrali jste odpověď.';
                feedbackEl.className = 'mt-4 p-3 rounded-lg text-sm bg-yellow-100 text-yellow-800 result-feedback';
            }
        });
        const summaryEl = document.getElementById('quiz-summary');
        summaryEl.textContent = `Vaše skóre: ${score} z ${quizData.questions.length}`;
        summaryEl.classList.remove('hidden');

        try {
            const resultData = {
                lessonId: currentLessonId,
                quizTitle: lessonData.title || "Kvíz",
                score: score,
                totalQuestions: quizData.questions.length,
                answers: studentAnswers
            };
            await submitQuizResults(resultData);
            showToast("Výsledky kvízu byly uloženy.");
        } catch (error) {
            console.error("Error submitting quiz results:", error);
            showToast("Chyba při ukládání výsledků kvízu.", true);
        }
    });
}