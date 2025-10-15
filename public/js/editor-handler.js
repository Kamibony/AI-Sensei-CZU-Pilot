import { callGenerateContent } from './gemini-api.js';
import { showToast } from './utils.js';
import { handleFileUpload } from './upload-handler.js';

let editor;

/**
 * Nová funkcia, ktorá aktívne čaká, kým budú skripty pre editor dostupné.
 * @param {number} timeout - Maximálny čas čakania v milisekundách.
 * @returns {Promise<void>}
 */
function waitForEditorScripts(timeout = 5000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            // Kontrolujeme, či sú VŠETKY potrebné knižnice načítané
            if (window.EditorJS && window.Header && window.List && window.SimpleImage) {
                clearInterval(interval);
                resolve();
            } else if (Date.now() - startTime > timeout) {
                clearInterval(interval);
                reject(new Error("Vypršal čas na načítanie skriptov pre editor."));
            }
        }, 100); // Kontrolujeme každých 100ms
    });
}

export async function initializeEditor(containerId, initialContent = []) {
    try {
        // Počkáme, kým budú skripty naozaj pripravené
        await waitForEditorScripts();
    } catch (error) {
        console.error(error.message);
        const errorMsg = "Editor.js alebo jeho doplnky neboli správne načítané. Skontrolujte pripojenie k internetu a skúste obnoviť stránku.";
        showToast(errorMsg, true);
        const editorContainer = document.getElementById(containerId);
        if (editorContainer) {
            editorContainer.innerHTML = `<div class="p-4 text-red-700 bg-red-100 border border-red-400 rounded">${errorMsg}</div>`;
        }
        return;
    }

    // Teraz sme si istí, že knižnice sú k dispozícii
    const EditorJS = window.EditorJS;

    // Zničíme starú inštanciu, ak existuje, aby sme predišli chybám
    if (editor && editor.destroy) {
        await editor.destroy();
    }

    editor = new EditorJS({
        holder: containerId,
        tools: {
            header: window.Header,
            list: window.List,
            image: window.SimpleImage,
        },
        data: {
            blocks: initialContent
        },
        autofocus: true,
        placeholder: 'Zadajte / pre príklady alebo začnite písať...',
    });

    try {
        await editor.isReady;
        console.log('Editor.js je pripravený.');
    } catch (error) {
        console.error('Editor.js sa nepodarilo inicializovať:', error);
        return;
    }

    document.getElementById('save-content-btn')?.addEventListener('click', saveContent);
    document.getElementById('generate-content-btn')?.addEventListener('click', generateAiContent);

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
    if (!editor) return;
    try {
        const outputData = await editor.save();
        console.log("Saving content:", outputData);
        // Tu príde logika na ukladanie
        showToast("Obsah úspešne uložený!");
    } catch (error) {
        console.error('Ukladanie zlyhalo: ', error);
        showToast("Uloženie zlyhalo.", true);
    }
}

async function generateAiContent() {
    if (!editor) return;
    const prompt = document.getElementById('ai-prompt').value;
    const contentType = document.getElementById('content-type-selector').value;
    const lessonId = document.getElementById('lesson-id-display').textContent;

    if (!prompt) {
        showToast('Prosím, zadajte text pre AI.', true);
        return;
    }

    showToast('Generujem obsah, prosím čakajte...');
    try {
        const result = await callGenerateContent({ prompt, contentType, lessonId });
        if (result.error) throw new Error(result.error);
        editor.render({ blocks: result.content });
        showToast('Obsah bol úspešne vygenerovaný!');
    } catch (error) {
        console.error('Generovanie obsahu zlyhalo:', error);
        showToast(`Generovanie obsahu zlyhalo: ${error.message}`, true);
    }
}
