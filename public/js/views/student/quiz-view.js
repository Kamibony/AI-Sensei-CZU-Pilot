import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function renderQuiz(container, db, lessonId) {
    if (!lessonId) {
        container.innerHTML = `<p class="p-4">Nebyla vybrána žádná lekce pro zobrazení kvízu.</p>`;
        return;
    }

    try {
        container.innerHTML = `<div class="p-4">Načítání kvízu...</div>`;
        const quizDocRef = doc(db, "lessons", lessonId, "activities", "quiz");
        const quizDoc = await getDoc(quizDocRef);

        if (!quizDoc.exists()) {
            container.innerHTML = `<p class="p-4">Pro tuto lekci nebyl nalezen žádný kvíz.</p>`;
            return;
        }

        const quizData = quizDoc.data().data; // Předpokládáme, že JSON je v poli 'data'
        let quizHtml = `
            <div class="p-6">
                <h1 class="text-3xl font-bold text-slate-800 mb-4">Kvíz k lekci</h1>
                <form id="quiz-form" class="space-y-6">
        `;

        quizData.questions.forEach((question, index) => {
            quizHtml += `
                <div class="bg-white p-4 rounded-lg shadow-md">
                    <p class="font-semibold mb-2">${index + 1}. ${question.question}</p>
                    <div class="space-y-2">
                        ${Object.entries(question.options).map(([key, value]) => `
                            <div>
                                <label class="flex items-center">
                                    <input type="radio" name="question-${index}" value="${key}" class="mr-2">
                                    <span>${key}: ${value}</span>
                                </label>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        quizHtml += `
                    <button type="submit" class="bg-green-700 text-white font-bold py-2 px-4 rounded hover:bg-green-800">Odeslat kvíz</button>
                </form>
                <div id="quiz-results" class="mt-6"></div>
            </div>
        `;

        container.innerHTML = quizHtml;

        document.getElementById('quiz-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const resultsContainer = document.getElementById('quiz-results');
            let score = 0;
            quizData.questions.forEach((question, index) => {
                const selectedOption = document.querySelector(`input[name="question-${index}"]:checked`);
                if (selectedOption && selectedOption.value === question.correctAnswer) {
                    score++;
                }
            });
            resultsContainer.innerHTML = `<h2 class="text-2xl font-bold">Váš výsledek: ${score} / ${quizData.questions.length}</h2>`;
        });

    } catch (error) {
        console.error("Chyba při načítání kvízu:", error);
        container.innerHTML = `<p class="p-4 text-red-500">Nepodařilo se načíst kvíz.</p>`;
    }
}
