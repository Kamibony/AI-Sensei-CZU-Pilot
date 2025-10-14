import { showToast } from './utils.js';
import { db } from './firebase-init.js';
import { doc, setDoc, serverTimestamp, collection, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { 
    createQuizForLesson, 
    createTestForLesson, 
    createPodcastForLesson, 
    createPresentationForLesson,
    generateContentForLesson 
} from './gemini-api.js';

let editorInstance = null;
let currentLesson = null;

export function renderEditorMenu(container, lessonData) {
    currentLesson = lessonData;
    const isNewLesson = !lessonData;

    container.innerHTML = `
        <header class="p-4 border-b border-slate-200 flex-shrink-0">
            <h2 class="text-xl font-bold text-slate-800">${isNewLesson ? 'Nová lekce' : 'Editor lekce'}</h2>
        </header>
        <div class="flex-grow overflow-y-auto p-4 space-y-4">
            <div>
                <label for="lesson-title-editor" class="text-sm font-semibold text-slate-600">Název lekce</label>
                <input type="text" id="lesson-title-editor" class="w-full p-2 border rounded-lg mt-1" value="${lessonData?.title || ''}">
            </div>
            <div>
                <label for="lesson-subtitle-editor" class="text-sm font-semibold text-slate-600">Podtitulek</label>
                <input type="text" id="lesson-subtitle-editor" class="w-full p-2 border rounded-lg mt-1" value="${lessonData?.subtitle || ''}">
            </div>
            <div>
                <label for="lesson-content-editor" class="text-sm font-semibold text-slate-600">Hlavní obsah</label>
                <div id="text-editor-instance" class="mt-1"></div>
            </div>

            <div id="ai-tools-container" class="${isNewLesson ? 'hidden' : ''}">
                <h3 class="text-lg font-bold text-slate-700 mt-6 mb-3">AI Nástroje</h3>
                <div class="space-y-2">
                    <button id="generate-quiz-btn" class="w-full p-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 text-sm">Vytvořit kvíz</button>
                    <button id="generate-test-btn" class="w-full p-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 text-sm">Vytvořit test</button>
                    <button id="generate-podcast-btn" class="w-full p-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 text-sm">Vytvořit podcast</button>
                    <button id="generate-presentation-btn" class="w-full p-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 text-sm">Vytvořit prezentaci</button>
                </div>
                 <div class="mt-4">
                    <label for="ai-prompt" class="text-sm font-semibold text-slate-600">Vytvoriť text z promtu</label>
                    <textarea id="ai-prompt" class="w-full p-2 border rounded-lg mt-1" rows="3" placeholder="Napr.: Vytvor text o histórii programovania v 5 odsekoch..."></textarea>
                    <button id="generate-text-btn" class="w-full mt-2 p-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 text-sm">Generovat text</button>
                </div>
            </div>
        </div>
        <footer class="p-4 border-t border-slate-200 flex-shrink-0">
            <button id="save-lesson-btn" class="w-full p-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800">Uložit lekci</button>
        </footer>
    `;

    initializeTextEditor('#text-editor-instance', lessonData?.content || '');
    document.getElementById('save-lesson-btn').addEventListener('click', handleSaveLesson);

    // Pridanie event listenerov pre AI tlačidlá, ak ide o existujúcu lekciu
    if (!isNewLesson) {
        addAiButtonListeners();
    }
}

function addAiButtonListeners() {
    const lessonContent = getEditorContent();
    if (!currentLesson || !currentLesson.id) {
        showToast("Nejprve uložte lekci, než použijete AI nástroje.", true);
        return;
    }

    document.getElementById('generate-quiz-btn').addEventListener('click', async () => {
        const result = await createQuizForLesson(currentLesson.id, lessonContent);
        if (result) showToast('Kvíz byl úspěšně vytvořen.');
    });

    document.getElementById('generate-test-btn').addEventListener('click', async () => {
        const result = await createTestForLesson(currentLesson.id, lessonContent);
        if (result) showToast('Test byl úspěšně vytvořen.');
    });

    document.getElementById('generate-podcast-btn').addEventListener('click', async () => {
        const result = await createPodcastForLesson(currentLesson.id, lessonContent);
        if (result) showToast('Podcast byl úspěšně vytvořen.');
    });

    document.getElementById('generate-presentation-btn').addEventListener('click', async () => {
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
            // Po prvom uložení aktualizujeme currentLesson a zobrazíme AI nástroje
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

export function initializeTextEditor(selector, initialContent = '') {
    const editorEl = document.querySelector(selector);
    if (!editorEl) return;

    if (editorInstance) {
        editorInstance.destroy().catch(() => {});
    }

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

export function getEditorContent() {
    return editorInstance ? editorInstance.getData() : '';
}
