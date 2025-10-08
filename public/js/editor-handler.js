import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from './firebase-init.js';
import { showToast } from './utils.js';
import { callGeminiApi, callGeminiForJson } from './gemini-api.js';

// Module-level state
let editorElement = null;
let currentLesson = null;
let currentViewId = 'text'; // Default view

// Main initialization function for the editor
export function initEditor(selector, lesson) {
    const container = document.querySelector(selector);
    if (!container) {
        console.error(`Editor container '${selector}' not found.`);
        return;
    }
    editorElement = container;
    currentLesson = lesson;
    showEditorContent('text'); // Show the default view
}

// Renders different views within the editor (text, quiz, media, etc.)
export function showEditorContent(viewId) {
    if (!editorElement) return;
    currentViewId = viewId; // track current view

    let content = '';
    switch (viewId) {
        case 'text':
            content = renderTextView();
            break;
        case 'quiz':
            content = renderQuizView();
            break;
        case 'media':
            content = '<div id="media-library-content" class="p-4">Správa médií se připravuje.</div>';
            break;
        default:
            content = `<p>Unknown view: ${viewId}</p>`;
    }
    editorElement.innerHTML = content;
    attachEventListeners(viewId);
}

// Renders the HTML for the text editing view
function renderTextView() {
    return `
        <div class="p-4 sm:p-6 h-full flex flex-col">
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
        </div>
    `;
}

// Renders the HTML for the quiz editing view
function renderQuizView() {
     return `
        <div class="p-4 sm:p-6 h-full flex flex-col">
            <div class="flex-shrink-0">
                 <p class="text-slate-500 mb-4">Vygenerujte kvíz na základě obsahu lekce. Kvíz bude ve formátu JSON.</p>
                 <div class="flex items-center justify-end mt-4">
                    <button id="generate-quiz-btn" class="px-5 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition flex items-center">✨<span class="ml-2">Generovat kvíz</span></button>
                </div>
            </div>
            <div id="generation-output" class="mt-6 border-t pt-6 text-slate-700 flex-grow overflow-y-auto">
                 <pre class="bg-slate-100 p-4 rounded-lg text-sm">${currentLesson.quizData ? JSON.stringify(currentLesson.quizData, null, 2) : '<div class="text-center p-8 text-slate-400">Kvíz se vygeneruje zde...</div>'}</pre>
            </div>
        </div>
    `;
}

// Attaches event listeners for the current view
function attachEventListeners(viewId) {
    if (viewId === 'text') {
        document.getElementById('generate-text-btn')?.addEventListener('click', handleTextGeneration);
    }
    if (viewId === 'quiz') {
        document.getElementById('generate-quiz-btn')?.addEventListener('click', handleQuizGeneration);
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

// Handles the AI quiz generation
async function handleQuizGeneration() {
    const outputEl = document.getElementById('generation-output');
    const generateBtn = document.getElementById('generate-quiz-btn');
    const prompt = `Na základě následujícího textu vytvoř sadu 3-5 kvízových otázek s více možnostmi (jedna správná). Formátuj odpověď jako JSON pole objektů, kde každý objekt má klíče 'question', 'options' (pole stringů) a 'correctAnswer' (index správné odpovědi). Text: """${currentLesson.content}"""`;

    if (!currentLesson.content) {
        showToast('Nelze generovat kvíz, protože lekce nemá žádný obsah.', true);
        return;
    }

    const originalBtnHtml = generateBtn.innerHTML;
    generateBtn.innerHTML = '<span>Generuji...</span>';
    generateBtn.disabled = true;
    outputEl.innerHTML = '<div class="p-8 text-center text-slate-500">🤖 AI Sensei připravuje kvíz...</div>';

    try {
        const result = await callGeminiForJson(prompt);
        if (result.error) throw new Error(result.error);
        outputEl.innerHTML = `<pre class="bg-slate-100 p-4 rounded-lg text-sm">${JSON.stringify(result, null, 2)}</pre>`;
    } catch (e) {
        showToast(`Došlo k chybě při generování kvízu: ${e.message}`, true);
        outputEl.innerHTML = `<pre class="bg-slate-100 p-4 rounded-lg text-sm">${currentLesson.quizData ? JSON.stringify(currentLesson.quizData, null, 2) : ''}</pre>`;
    } finally {
        generateBtn.innerHTML = originalBtnHtml;
        generateBtn.disabled = false;
    }
}


// Saves the generated content to Firestore
export async function handleSaveGeneratedContent(lessonId) {
    const outputEl = document.getElementById('generation-output');
    if (!outputEl || !lessonId) {
        showToast('Nelze uložit. Chybí data.', true);
        return;
    }

    const lessonRef = doc(db, 'lessons', lessonId);
    let dataToUpdate = {};
    let newContent;

    try {
        if (currentViewId === 'text') {
            newContent = outputEl.querySelector('.prose')?.innerHTML;
            if (newContent) {
                dataToUpdate.content = newContent;
                currentLesson.content = newContent; // Update local state
            }
        } else if (currentViewId === 'quiz') {
            newContent = JSON.parse(outputEl.querySelector('pre').innerText);
            if(newContent) {
                dataToUpdate.quizData = newContent;
                currentLesson.quizData = newContent; // Update local state
            }
        }

        if (Object.keys(dataToUpdate).length === 0) {
            showToast('Není co ukládat.', true);
            return;
        }

        await updateDoc(lessonRef, dataToUpdate);
        showToast('Obsah byl úspěšně uložen!');
    } catch (error) {
        console.error("Error saving content: ", error);
        showToast(`Uložení obsahu selhalo: ${error.message}`, true);
    }
}