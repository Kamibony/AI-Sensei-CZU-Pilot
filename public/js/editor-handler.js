import { showToast } from './utils.js';

let editorInstance = null;

export function initializeTextEditor(selector, initialContent = '') {
    const container = document.querySelector(selector);
    if (!container) {
        console.error(`Editor container ${selector} not found.`);
        return;
    }

    // Zničíme predchádzajúcu inštanciu, ak existuje, aby sa predišlo chybám
    if (editorInstance) {
        editorInstance.destroy().catch(error => {
            console.error('Error destroying the previous editor instance:', error);
        });
        editorInstance = null;
    }

    // Tento príkaz použije knižnicu CKEditor, ktorú načítava index.html
    ClassicEditor
        .create(container, {
            toolbar: [
                'heading', '|',
                'bold', 'italic', 'link', 'bulletedList', 'numberedList', '|',
                'blockQuote', 'undo', 'redo'
            ]
        })
        .then(newEditor => {
            editorInstance = newEditor;
            if (initialContent) {
                newEditor.setData(initialContent);
            }
        })
        .catch(error => {
            console.error('Error initializing text editor:', error);
            showToast('Nepodařilo se inicializovat textový editor.', true);
        });
}

// Funkcia, ktorá získa obsah z editora - teraz je správne exportovaná
export function getEditorContent() {
    if (editorInstance) {
        return editorInstance.getData();
    }
    return '';
}
