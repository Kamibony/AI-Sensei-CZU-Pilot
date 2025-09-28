import { callGeminiApi } from './api.js';

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
            return `<p>O conteÃºdo para a seÃ§Ã£o '${viewId}' estÃ¡ em preparaÃ§Ã£o.</p>`;
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
            <div><label class="block font-medium text-slate-600 mb-1">Nome da liÃ§Ã£o</label><input id="lesson-title" type="text" class="w-full p-2 rounded-lg form-input" value="${currentLesson?.title || ''}"></div>
            <div><label class="block font-medium text-slate-600 mb-1">SubtÃ­tulo</label><input id="lesson-subtitle" type="text" class="w-full p-2 rounded-lg form-input" value="${currentLesson?.subtitle || ''}"></div>
            <div><label class="block font-medium text-slate-600 mb-1">Ãcone (emoji)</label><input id="lesson-icon" type="text" class="w-full p-2 rounded-lg form-input" value="${currentLesson?.icon || 'ðŸ†•'}"></div>
            <div class="text-right pt-4"><button id="save-lesson-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800">Salvar liÃ§Ã£o</button></div>
        </div>
    `;
}

function renderTextView() {
    return `
        <p class="text-slate-500 mb-4">Insira um prompt de IA para gerar o texto de estudo principal para esta liÃ§Ã£o.</p>
        <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder="Ex: 'Crie um texto introdutÃ³rio envolvente sobre os princÃ­pios da mecÃ¢nica quÃ¢ntica para iniciantes...'"></textarea>
        <div class="flex items-center justify-between mt-4">
            <div class="flex items-center space-x-4">
                <label class="font-medium">Comprimento:</label>
                <select id="length-select" class="rounded-lg border-slate-300"><option>Curto</option><option selected>MÃ©dio</option><option>Longo</option></select>
            </div>
            <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition flex items-center">âœ¨<span class="ml-2">Gerar texto</span></button>
        </div>
        <div id="generation-output" class="mt-6 border-t pt-6 text-slate-700 prose max-w-none">
            <div class="text-center p-8 text-slate-400">O conteÃºdo serÃ¡ gerado aqui...</div>
        </div>
    `;
}

async function handleTextGeneration() {
    const outputEl = document.getElementById('generation-output');
    const promptInput = document.getElementById('prompt-input');
    const generateBtn = document.getElementById('generate-btn');
    const length = document.getElementById('length-select').value;
    const prompt = `Crie um texto de estudo com comprimento "${length}" com base na seguinte instruÃ§Ã£o: "${promptInput.value.trim()}"`;

    if (!promptInput.value.trim()) {
        outputEl.innerHTML = '<div class="p-4 bg-red-100 text-red-700 rounded-lg">Por favor, insira um texto no prompt.</div>';
        return;
    }

    const originalText = generateBtn.innerHTML;
    generateBtn.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"></div><span class="ml-2">Gerando...</span>';
    generateBtn.disabled = true;
    outputEl.innerHTML = '<div class="p-8 text-center text-slate-500">ðŸ¤– AI Sensei estÃ¡ pensando e criando o conteÃºdo...</div>';

    try {
        const result = await callGeminiApi(prompt);
        if (result.error) throw new Error(result.error);
        outputEl.innerHTML = `<div class="prose max-w-none">${result.text}</div>`;
    } catch (e) {
        outputEl.innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg">Ocorreu um erro: ${e.message}</div>`;
    } finally {
        generateBtn.innerHTML = originalText;
        generateBtn.disabled = false;
    }
}
