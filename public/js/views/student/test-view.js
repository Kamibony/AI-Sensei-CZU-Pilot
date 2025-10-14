import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function renderTest(container, db, lessonId) {
    if (!lessonId) {
        container.innerHTML = `<p class="p-4">Nebyla vybrána žádná lekce pro zobrazení testu.</p>`;
        return;
    }

    try {
        container.innerHTML = `<div class="p-4">Načítání testu...</div>`;
        const testDocRef = doc(db, "lessons", lessonId, "activities", "test");
        const testDoc = await getDoc(testDocRef);

        if (!testDoc.exists()) {
            container.innerHTML = `<p class="p-4">Pro tuto lekci nebyl nalezen žádný test.</p>`;
            return;
        }

        const testData = testDoc.data().data;
        let testHtml = `
            <div class="p-6">
                <h1 class="text-3xl font-bold text-slate-800 mb-4">Test k lekci</h1>
                <form id="test-form" class="space-y-6">
        `;

        testData.questions.forEach((question, index) => {
            testHtml += `
                <div class="bg-white p-4 rounded-lg shadow-md">
                    <p class="font-semibold mb-2">${index + 1}. ${question.question}</p>
            `;
            if (question.type === 'multiple-choice') {
                testHtml += `
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
                `;
            } else if (question.type === 'open-ended') {
                testHtml += `<textarea name="question-${index}" class="w-full p-2 border rounded-lg" rows="3"></textarea>`;
            }
            testHtml += `</div>`;
        });

        testHtml += `
                    <button type="submit" class="bg-green-700 text-white font-bold py-2 px-4 rounded hover:bg-green-800">Odeslat test</button>
                </form>
                <div id="test-results" class="mt-6"></div>
            </div>
        `;
        container.innerHTML = testHtml;

        document.getElementById('test-form').addEventListener('submit', (e) => {
            e.preventDefault();
            // Zde by byla logika pro vyhodnocení, která je složitější pro otevřené otázky
            document.getElementById('test-results').innerHTML = `<h2 class="text-2xl font-bold">Test byl odeslán k vyhodnocení.</h2>`;
        });

    } catch (error) {
        console.error("Chyba při načítání testu:", error);
        container.innerHTML = `<p class="p-4 text-red-500">Nepodařilo se načíst test.</p>`;
    }
}
