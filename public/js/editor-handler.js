import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from './firebase-init.js';
import { showToast } from './utils.js';
import { callGeminiApi } from './gemini-api.js';

// Module-level state
let currentLesson = null;

// Main initialization function for the editor
export function initializeEditor(lesson) {
    currentLesson = lesson;
}

// Returns the HTML content for a specific editor view
export function getEditorContent(viewId) {
    if (!currentLesson) return '<p>No lesson selected.</p>';

    switch (viewId) {
        case 'details':
            return renderDetailsView();
        case 'text':
            return renderTextView();
        case 'files':
            return renderFilesView();
        default:
            return `<p>Unknown view: ${viewId}</p>`;
    }
}

// Attaches event listeners for the current view
export function attachEditorEventListeners(viewId) {
    if (viewId === 'details') {
        document.getElementById('save-lesson-details-btn')?.addEventListener('click', handleSaveDetails);
    }
    if (viewId === 'text') {
        document.getElementById('generate-text-btn')?.addEventListener('click', handleTextGeneration);
        document.getElementById('save-lesson-text-btn')?.addEventListener('click', () => handleSaveTextContent(currentLesson.id));
    }
    // No specific listeners for 'files' view needed here, handled by upload-handler.js
}

// Renders the HTML for the lesson details view
function renderDetailsView() {
    return `
        <div class="space-y-4">
            <div>
                <label for="lesson-title" class="block text-sm font-medium text-slate-700">Název lekce</label>
                <input type="text" id="lesson-title" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm" value="${currentLesson.title || ''}">
            </div>
            <div>
                <label for="lesson-subtitle" class="block text-sm font-medium text-slate-700">Podtitulek</label>
                <input type="text" id="lesson-subtitle" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm" value="${currentLesson.subtitle || ''}">
            </div>
            <div>
                <label for="lesson-icon" class="block text-sm font-medium text-slate-700">Ikona</label>
                <input type="text" id="lesson-icon" class="mt-1 block w-full rounded-md border-slate-300 shadow-sm" value="${currentLesson.icon || ''}">
            </div>
            <div class="flex justify-end">
                <button id="save-lesson-details-btn" class="px-5 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700">Uložit detaily</button>
            </div>
        </div>
    `;
}

// Renders the HTML for the text editing view
function renderTextView() {
    return `
        <div class="flex flex-col h-full">
            <div class="flex-shrink-0">
                <p class="text-slate-500 mb-4">Zadejte AI prompt a vygenerujte hlavní studijní text pro tuto lekci.</p>
                <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder="Např. 'Vytvoř poutavý úvodní text o principech kvantové mechaniky pro úplné začátečníky...'"></textarea>
                <div class="flex items-center justify-between mt-4">
                    <div class="flex items-center space-x-4">
                        <label class="font-medium">Délka:</label>
                        <select id="length-select" class="rounded-lg border-slate-300"><option>Krátký</option><option selected>Střední</option><option>Dlouhý</option></select>
                    </div>
                    <button id="generate-text-btn" class="px-5 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition flex items-center">✨<span class="ml-2">Generovat text</span></button>
                </div>
            </div>
            <div id="generation-output" class="mt-6 border-t pt-6 text-slate-700 prose max-w-none flex-grow overflow-y-auto">
                ${currentLesson.content || '<div class="text-center p-8 text-slate-400">Obsah se vygeneruje zde...</div>'}
            </div>
            <div class="flex justify-end mt-4 border-t pt-4">
                <button id="save-lesson-text-btn" class="px-5 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700">Uložit text</button>
            </div>
        </div>
    `;
}

// Renders the HTML for the files view
function renderFilesView() {
    // This view is mostly handled by upload-handler.js, this is just a container
    return `
        <div id="upload-container">
            <p class="text-slate-500 mb-4">Nahrajte soubory k této lekci.</p>
            <!-- Upload form and file list will be injected here by upload-handler.js -->
        </div>
    `;
}

// Handles saving the lesson details
async function handleSaveDetails() {
    const title = document.getElementById('lesson-title').value;
    const subtitle = document.getElementById('lesson-subtitle').value;
    const icon = document.getElementById('lesson-icon').value;

    const lessonRef = doc(db, 'lessons', currentLesson.id);
    try {
        await updateDoc(lessonRef, { title, subtitle, icon });
        // Update local state
        currentLesson.title = title;
        currentLesson.subtitle = subtitle;
        currentLesson.icon = icon;
        showToast('Detaily lekce uloženy!');
    } catch (error) {
        console.error("Error saving details:", error);
        showToast('Uložení detailů selhalo.', true);
    }
}

// Handles the AI text generation
async function handleTextGeneration() {
    const outputEl = document.getElementById('generation-output');
    const promptInput = document.getElementById('prompt-input');
    const generateBtn = document.getElementById('generate-text-btn');
    const length = document.getElementById('length-select').value;
    const prompt = `Vytvoř studijní text o délce '${length}' na základě instrukce: "${promptInput.value.trim()}"`;

    if (!promptInput.value.trim()) {
        showToast('Prosím, zadejte text do promptu.', true);
        return;
    }

    const originalBtnHtml = generateBtn.innerHTML;
    generateBtn.innerHTML = '<span>Generuji...</span>';
    generateBtn.disabled = true;
    outputEl.innerHTML = '<div class="p-8 text-center text-slate-500">🤖 AI Sensei přemýšlí...</div>';

    try {
        const result = await callGeminiApi(prompt);
        if (result.error) throw new Error(result.error);
        outputEl.innerHTML = `<div class="prose max-w-none">${result.text.replace(/\n/g, '<br>')}</div>`;
    } catch (e) {
        showToast(`Došlo k chybě: ${e.message}`, true);
        outputEl.innerHTML = `<div class="prose max-w-none">${currentLesson.content || ''}</div>`;
    } finally {
        generateBtn.innerHTML = originalBtnHtml;
        generateBtn.disabled = false;
    }
}

// Saves the generated text content to Firestore
async function handleSaveTextContent(lessonId) {
    const outputEl = document.getElementById('generation-output');
    if (!outputEl || !lessonId) {
        showToast('Nelze uložit. Chybí data.', true);
        return;
    }

    const lessonRef = doc(db, 'lessons', lessonId);
    const newContent = outputEl.querySelector('.prose')?.innerHTML;

    if (!newContent) {
        showToast('Není co ukládat.', true);
        return;
    }

    try {
        await updateDoc(lessonRef, { content: newContent });
        currentLesson.content = newContent; // Update local state
        showToast('Obsah byl úspěšně uložen!');
    } catch (error) {
        console.error("Error saving content: ", error);
        showToast(`Uložení obsahu selhalo: ${error.message}`, true);
    }
}