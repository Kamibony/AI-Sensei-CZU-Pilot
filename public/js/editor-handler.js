import { showToast } from './utils.js';
import { db } from './firebase-init.js';
import { doc, setDoc, serverTimestamp, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let editorInstance = null;
let currentLesson = null;

// --- OPRAVA: Pridané kľúčové slovo "export" ---
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
        </div>
        <footer class="p-4 border-t border-slate-200 flex-shrink-0">
            <button id="save-lesson-btn" class="w-full p-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800">Uložit lekci</button>
        </footer>
    `;

    initializeTextEditor('#text-editor-instance', lessonData?.content || '');
    document.getElementById('save-lesson-btn').addEventListener('click', handleSaveLesson);
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
        createdAt: currentLesson?.createdAt || serverTimestamp(),
    };

    try {
        const lessonRef = currentLesson ? doc(db, 'lessons', currentLesson.id) : doc(collection(db, 'lessons'));
        await setDoc(lessonRef, lessonPayload, { merge: true });
        showToast(`Lekce "${title}" byla úspěšně uložena.`);
        
        // Zde by mělo dojít k obnovení pohledu, např. zavoláním callbacku
        // Pro jednoduchost můžeme předpokládat, že hlavní modul se o to postará sám
        // díky onSnapshot listeneru.

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
