let currentLesson = null;
let db = null;

export function initializeEditor(lesson, firestoreDb) {
    currentLesson = lesson;
    db = firestoreDb;
}

export function getEditorContent(viewId) {
    switch(viewId) {
        case 'details':
            return renderDetailsView();
        case 'text':
            return renderTextView();
        default:
            return `<p>Obsah pro sekci '${viewId}' se připravuje.</p>`;
    }
}

export function attachEditorEventListeners(viewId) {
    if (viewId === 'text') {
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', handleTextGeneration);
        }
    }
}

function renderDetailsView() {
    return `
        <div id="lesson-details-form" class="space-y-4">
            <div><label class="block font-medium text-slate-600 mb-1">Název lekce</label><input id="lesson-title" type="text" class="w-full p-2 rounded-lg form-input" value="${currentLesson?.title || ''}"></div>
            <div><label class="block font-medium text-slate-600 mb-1">Podtitulek</label><input id="lesson-subtitle" type="text" class="w-full p-2 rounded-lg form-input" value="${currentLesson?.subtitle || ''}"></div>
            <div><label class="block font-medium text-slate-600 mb-1">Ikona (emoji)</label><input id="lesson-icon" type="text" class="w-full p-2 rounded-lg form-input" value="${currentLesson?.icon || '🆕'}"></div>
            <div class="text-right pt-4"><button id="save-lesson-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800">Uložit lekci</button></div>
        </div>
    `;
}

function renderTextView() {
    return `
        <p class="text-slate-500 mb-4">Zadejte AI prompt a vygenerujte hlavní studijní text pro tuto lekci.</p>
        <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder="Např. 'Vytvoř poutavý úvodní text o principech kvantové mechaniky pro úplné začátečníky...'"></textarea>
        <div class="flex items-center justify-between mt-4">
            <div class="flex items-center space-x-4">
                <label class="font-medium">Délka:</label>
                <select id="length-select" class="rounded-lg border-slate-300"><option>Krátký</option><option selected>Střední</option><option>Dlouhý</option></select>
            </div>
            <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition flex items-center">✨<span class="ml-2">Generovat text</span></button>
        </div>
        <div id="generation-output" class="mt-6 border-t pt-6 text-slate-700 prose max-w-none">
            <div class="text-center p-8 text-slate-400">Obsah se vygeneruje zde...</div>
        </div>
    `;
}

async function handleTextGeneration() {
    const outputEl = document.getElementById('generation-output');
    const promptInput = document.getElementById('prompt-input');
    const generateBtn = document.getElementById('generate-btn');
    const length = document.getElementById('length-select').value;
    const prompt = `Vytvoř studijní text o délce '${length}' na základě instrukce: "${promptInput.value.trim()}"`;

    if (!promptInput.value.trim()) {
        outputEl.innerHTML = '<div class="p-4 bg-red-100 text-red-700 rounded-lg">Prosím, zadejte text do promptu.</div>';
        return;
    }

    const originalText = generateBtn.innerHTML;
    generateBtn.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"></div><span class="ml-2">Generuji...</span>';
    generateBtn.disabled = true;
    outputEl.innerHTML = '<div class="p-8 text-center text-slate-500">🤖 AI Sensei přemýšlí a tvoří obsah...</div>';

    try {
        // Zavoláme globálně dostupnou funkci z main.js
        const result = await window.callGeminiApi(prompt);
        if (result.error) throw new Error(result.error);
        outputEl.innerHTML = `<div class="prose max-w-none">${result.text.replace(/\n/g, '<br>')}</div>`;
    } catch (e) {
        outputEl.innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg">Došlo k chybě: ${e.message}</div>`;
    } finally {
        generateBtn.innerHTML = originalText;
        generateBtn.disabled = false;
    }
}