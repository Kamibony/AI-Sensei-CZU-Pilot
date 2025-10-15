import { callGenerateContent } from './gemini-api.js';
import { showToast } from './utils.js';
import { handleFileUpload } from './upload-handler.js';

let editor;

export async function initializeEditor(containerId, initialContent = '') {
    // --- VYLEPŠENÁ KONTROLA ---
    // Skontrolujeme, či sú globálne premenné z knižníc naozaj dostupné
    if (typeof window.EditorJS === 'undefined' || typeof window.Header === 'undefined' || typeof window.List === 'undefined') {
        const errorMsg = "Editor.js alebo jeho doplnky neboli správne načítané. Skontrolujte <script> značky v index.html a pripojenie k internetu.";
        console.error(errorMsg);
        showToast("Chyba: Nepodarilo sa načítať editor.", true);
        
        // Zobrazíme chybu priamo v mieste, kde mal byť editor
        const editorContainer = document.getElementById(containerId);
        if (editorContainer) {
            editorContainer.innerHTML = `<div class="p-4 text-red-700 bg-red-100 border border-red-400 rounded">${errorMsg}</div>`;
        }
        return; // Zastavíme vykonávanie funkcie
    }
    // --- KONIEC KONTROLY ---

    const EditorJS = window.EditorJS;
    editor = new EditorJS({
        holder: containerId,
        tools: {
            header: window.Header,
            list: window.List,
            image: window.SimpleImage, // SimpleImage môže byť voliteľný
        },
        data: {
            blocks: initialContent
        },
        autofocus: true,
        placeholder: 'Zadajte / pre príkazy alebo začnite písať...',
    });

    try {
        await editor.isReady;
        console.log('Editor.js je pripravený.');
    } catch (error) {
        console.error('Editor.js sa nepodarilo inicializovať:', error);
        return;
    }

    document.getElementById('save-content-btn')?.addEventListener('click', saveContent);

    // AI Features
    const aiPromptInput = document.getElementById('ai-prompt');
    const generateContentBtn = document.getElementById('generate-content-btn');
    
    if (aiPromptInput && generateContentBtn) {
        generateContentBtn.addEventListener('click', generateAiContent);
    }

    // File Upload
    const fileUploadInput = document.getElementById('file-upload-input');
    const uploadButton = document.getElementById('upload-file-btn');
    if (fileUploadInput && uploadButton) {
        uploadButton.addEventListener('click', () => fileUploadInput.click());
        fileUploadInput.addEventListener('change', (event) => {
            const lessonId = document.getElementById('lesson-id-display').textContent;
            handleFileUpload(event.target.files, lessonId);
        });
    }
}

async function saveContent() {
    if (!editor) {
        console.error("Editor nie je inicializovaný.");
        return;
    }
    try {
        const outputData = await editor.save();
        console.log("Saving content:", outputData);
        // Implement save logic here
        showToast("Obsah úspěšně uložen!");
    } catch (error) {
        console.error('Saving failed: ', error);
        showToast("Uložení selhalo.", true);
    }
}

async function generateAiContent() {
    if (!editor) {
        console.error("Editor nie je inicializovaný.");
        return;
    }
    const prompt = document.getElementById('ai-prompt').value;
    const contentType = document.getElementById('content-type-selector').value;
    const lessonId = document.getElementById('lesson-id-display').textContent;

    if (!prompt) {
        showToast('Prosím, zadejte prompt pro AI.', true);
        return;
    }

    showToast('Generuji obsah, prosím čekejte...');
    
    try {
        const result = await callGenerateContent({ prompt, contentType, lessonId });

        if (result.error) {
            throw new Error(result.error);
        }

        if (contentType === 'presentation') {
            handlePresentation(result.presentation);
        } else {
            editor.render({ blocks: result.content });
        }

        showToast('Obsah byl úspěšně vygenerován!');
    } catch (error) {
        console.error('AI content generation failed:', error);
        showToast(`Generování obsahu selhalo: ${error.message}`, true);
    }
}

function handlePresentation(presentation) {
    if (!editor) return;
    if (!presentation || !presentation.slides) {
        console.error("Invalid presentation data received");
        return;
    }
    const blocks = presentation.slides.map(slide => {
        if (slide.title) {
            editor.blocks.insert('header', { text: slide.title, level: 2 });
        }
        if (slide.content && slide.content.length > 0) {
            editor.blocks.insert('list', { style: 'unordered', items: slide.content });
        }
    });
}
