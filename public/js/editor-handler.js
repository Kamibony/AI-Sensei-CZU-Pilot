import { doc, setDoc, serverTimestamp, collection, updateDoc, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, listAll } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, storage } from './firebase-init.js';
import { showToast } from './utils.js';
// Dôležité: Tieto funkcie volajú tvoj opravený backend (funkcie)
import { createQuizForLesson, createTestForLesson, createPodcastForLesson, createPresentationForLesson, generateContentForLesson } from './gemini-api.js';

let currentLesson = null;
let editorInstance = null; // Z CKEditora
const MAIN_COURSE_ID = "main-course";

// --- NOVÁ FUNKCIA NA STIAHNUTIE OBSAHU (z vašej starej logiky) ---
function handleDownloadLessonContent() {
    if (!currentLesson) {
        showToast("Lekce není načtena, nelze stáhnout obsah.", true);
        return;
    }

    let contentString = "";
    const title = currentLesson.title || "Nová lekce";

    // ... (logic for generating contentString remains the same as your old file)
    // TENTO KÓD VLOŽÍ VŠETKU LOGIKU STIAHNUTIA OBSAHU Z TVOJHO STARÉHO KÓDU

    // Pridanie hlavičky
    contentString += `# ${title}\n`;
    if (currentLesson.subtitle) {
        contentString += `## ${currentLesson.subtitle}\n`;
    }
    contentString += `\n---\n\n`;

    // Pridanie hlavného textu
    if (currentLesson.content) {
        contentString += `### Hlavní text pro studenty\n\n`;
        contentString += `${currentLesson.content}\n\n---\n\n`;
    }

    // Pridanie prezentácie
    if (currentLesson.presentationData && currentLesson.presentationData.slides) {
        contentString += `### Prezentace\n\n`;
        currentLesson.presentationData.slides.forEach((slide, index) => {
            contentString += `**Slide ${index + 1}: ${slide.title}**\n`;
            (slide.points || []).forEach(point => {
                contentString += `- ${point}\n`;
            });
            contentString += `\n`;
        });
        contentString += `---\n\n`;
    }

    // Pridanie kvízu
    if (currentLesson.quizData && currentLesson.quizData.questions) {
        contentString += `### Kvíz\n\n`;
        currentLesson.quizData.questions.forEach((q, index) => {
            contentString += `${index + 1}. ${q.question_text}\n`;
            (q.options || []).forEach((option, i) => {
                const isCorrect = i === q.correct_option_index ? " (Správně)" : "";
                contentString += `  - ${option}${isCorrect}\n`;
            });
            contentString += `\n`;
        });
        contentString += `---\n\n`;
    }

    // Pridanie testu
    if (currentLesson.testData && currentLesson.testData.questions) {
        contentString += `### Test\n\n`;
        currentLesson.testData.questions.forEach((q, index) => {
            contentString += `${index + 1}. ${q.question_text}\n`;
            (q.options || []).forEach((option, i) => {
                const isCorrect = i === q.correct_option_index ? " (Správně)" : "";
                contentString += `  - ${option}${isCorrect}\n`;
            });
            contentString += `\n`;
        });
        contentString += `---\n\n`;
    }

    // Vytvorenie a stiahnutie súboru
    const blob = new Blob([contentString], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast("Obsah lekce byl stažen.");
}
// -----------------------------------------------------------------------


// --- Funkcia, ktorá renderuje celú navigáciu editora ---
export function renderEditorMenu(container, lesson) {
    currentLesson = lesson;
    const isNewLesson = !lesson;

    container.innerHTML = `
        <header class="p-4 border-b border-slate-200 flex-shrink-0">
            <h2 class="text-xl font-bold text-slate-800">${isNewLesson ? 'Nová lekce' : 'Editor lekce'}</h2>
        </header>
        <div class="flex-grow overflow-y-auto p-4 space-y-4">
            <div>
                <label for="lesson-title-editor" class="text-sm font-semibold text-slate-600">Název lekce</label>
                <input type="text" id="lesson-title-editor" class="w-full p-2 border rounded-lg mt-1" value="${lesson?.title || ''}">
            </div>
            <div>
                <label for="lesson-subtitle-editor" class="text-sm font-semibold text-slate-600">Podtitulek</label>
                <input type="text" id="lesson-subtitle-editor" class="w-full p-2 border rounded-lg mt-1" value="${lesson?.subtitle || ''}">
            </div>
            <div>
                <label for="lesson-content-editor" class="text-sm font-semibold text-slate-600">Hlavní obsah</label>
                <div id="text-editor-instance" class="mt-1"></div>
            </div>

            <div id="ai-tools-container" class="mt-6 ${isNewLesson ? 'hidden' : ''}">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="text-lg font-bold text-slate-700">AI Nástroje</h3>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    ${renderAiToolButton('Vytvořit kvíz', 'quiz', 'M13.78 14.22a7 7 0 0 0 9.9-9.9M10.22 9.78a7 7 0 0 0-9.9 9.9')}
                    ${renderAiToolButton('Vytvořit test', 'test', 'M21.16 7.74l-1.38-1.38A2 2 0 0 0 18.36 6H5.64A2 2 0 0 0 4.22 7.78l1.38 1.38')}
                    ${renderAiToolButton('Vytvořit podcast', 'podcast', 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2')}
                    ${renderAiToolButton('Vytvořit prezentaci', 'presentation', 'M13 2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9l-7-7z M12 18H6v-2h6v2zm6-2h-4v-2h4v2zm0-4h-4V8h4v4z')}
                </div>
                <div class="mt-4">
                    <label for="ai-prompt" class="text-sm font-semibold text-slate-600">Vytvoriť text z promtu</label>
                    <textarea id="ai-prompt" class="w-full p-2 border rounded-lg mt-1" rows="3" placeholder="Napr.: Vytvor text o histórii programovania v 5 odsekoch..."></textarea>
                    <button id="generate-text-btn" class="w-full mt-2 p-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 text-sm flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path><path d="M5 3v4"></path><path d="M19 17v4"></path><path d="M3 5h4"></path><path d="M17 19h4"></path></svg>
                        Generovat text
                    </button>
                </div>
            </div>
        </div>
        <footer class="p-4 border-t border-slate-200 flex-shrink-0">
            <button id="save-lesson-btn" class="w-full p-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800">Uložit lekci</button>
            <button id="download-lesson-btn" title="Stáhnout obsah lekce" class="mt-2 w-full p-2 rounded-lg text-slate-700 border hover:bg-slate-100 transition-colors">
                 Stáhnout obsah lekce
             </button>
        </footer>
    `;

    initializeTextEditor('#text-editor-instance', lesson?.content || '');
    document.getElementById('save-lesson-btn').addEventListener('click', handleSaveLesson);
    document.getElementById('download-lesson-btn')?.addEventListener('click', handleDownloadLessonContent);


    if (!isNewLesson) {
        addAiButtonListeners(); // Dôležité: Týmto sa pripoja listenery na generovanie
    }
}

// --- Funkcia, ktorá renderuje jedno tlačidlo (Grafická inšpirácia) ---
function renderAiToolButton(text, id, svgPath) {
    return `
        <button id="generate-${id}-btn" class="flex flex-col items-center justify-center p-3 bg-white border rounded-lg hover:shadow-md hover:bg-slate-50 transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-500 mb-1"><path d="${svgPath}"></path></svg>
            <span class="text-sm font-semibold text-slate-700">${text}</span>
        </button>
    `;
}

// --- Funkcia, ktorá pripája volania na opravený backend ---
function addAiButtonListeners() {
    if (!currentLesson || !currentLesson.id) {
        showToast("Nejprve uložte lekci, než použijete AI nástroje.", true);
        return;
    }
    const getEditorContent = () => editorInstance ? editorInstance.getData() : '';

    // Dôležité: Tieto funkcie volajú tvoje opravené Firebase funkcie z ./gemini-api.js
    document.getElementById('generate-quiz-btn').addEventListener('click', async () => {
        const lessonContent = getEditorContent();
        const result = await createQuizForLesson(currentLesson.id, lessonContent);
        if (result) showToast('Kvíz byl úspěšně vytvořen.');
    });

    document.getElementById('generate-test-btn').addEventListener('click', async () => {
        const lessonContent = getEditorContent();
        const result = await createTestForLesson(currentLesson.id, lessonContent);
        if (result) showToast('Test byl úspěšně vytvořen.');
    });

    document.getElementById('generate-podcast-btn').addEventListener('click', async () => {
        const lessonContent = getEditorContent();
        const result = await createPodcastForLesson(currentLesson.id, lessonContent);
        if (result) showToast('Podcast byl úspěšně vytvořen.');
    });

    document.getElementById('generate-presentation-btn').addEventListener('click', async () => {
        const lessonContent = getEditorContent();
        const result = await createPresentationForLesson(currentLesson.id, lessonContent);
        if (result) showToast('Prezentace byla úspěšně vytvořena.');
    });

    document.getElementById('generate-text-btn').addEventListener('click', async () => {
        const prompt = document.getElementById('ai-prompt').value;
        if (!prompt) {
            showToast('Zadejte prosím prompt pro generování textu.', true);
            return;
        }
        const result = await generateContentForLesson(currentLesson.id, prompt);
        if (result && result.content) {
            editorInstance.setData(result.content);
            showToast('Text byl úspěšně vygenerován.');
        }
    });
}

// --- Základná logika ukladania (potrebná pre funkčnosť) ---
async function handleSaveLesson() {
    const title = document.getElementById('lesson-title-editor').value.trim();
    if (!title) {
        showToast("Název lekce je povinný.", true);
        return;
    }

    const lessonPayload = {
        title: title,
        subtitle: document.getElementById('lesson-subtitle-editor').value.trim(),
        content: getEditorContent(),
        updatedAt: serverTimestamp(),
    };

    try {
        let lessonRef;
        if (currentLesson && currentLesson.id) {
            lessonRef = doc(db, 'lessons', currentLesson.id);
            await updateDoc(lessonRef, lessonPayload);
        } else {
            lessonRef = doc(collection(db, 'lessons'));
            lessonPayload.createdAt = serverTimestamp();
            await setDoc(lessonRef, lessonPayload);
            currentLesson = { id: lessonRef.id, ...lessonPayload };
            document.getElementById('ai-tools-container').classList.remove('hidden');
            addAiButtonListeners();
        }
        showToast(`Lekce "${title}" byla úspěšně uložena.`);
    } catch (error) {
        console.error("Error saving lesson:", error);
        showToast("Chyba při ukládání lekce.", true);
    }
}

// --- Inicializácia Editora ---
export function initializeTextEditor(selector, initialContent = '') {
    const editorEl = document.querySelector(selector);
    if (!editorEl) return;

    if (editorInstance) {
        editorInstance.destroy().catch(() => {});
    }

    if (typeof ClassicEditor !== 'undefined') {
        ClassicEditor
            .create(editorEl, {
                toolbar: ['heading', '|', 'bold', 'italic', 'link', 'bulletedList', 'numberedList', 'blockQuote', '|', 'undo', 'redo']
            })
            .then(editor => {
                editorInstance = editor;
                editor.setData(initialContent);
            })
            .catch(error => {
                console.error('Error initializing CKEditor:', error);
            });
    }
}

export function getEditorContent() {
    return editorInstance ? editorInstance.getData() : '';
}
