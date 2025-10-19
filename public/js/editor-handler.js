// public/js/editor-handler.js

// Importy Firebase a pomocných funkcií
import { doc, addDoc, updateDoc, collection, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import * as firebaseInit from './firebase-init.js'; // Používame firebaseInit pre db, storage, functions
import { showToast } from './utils.js';
// Importy pre RAG z upload-handler.js
import { renderSelectedFiles, clearSelectedFiles, getSelectedFiles } from './upload-handler.js';

let currentLesson = null; // Aktuálne editovaná lekcia
let generateContentCallable = null; // Lazy loaded AI funkcia
let lastGeneratedData = null; // Posledný výsledok generovania

// Lazy load the callable function pre generovanie obsahu
function getGenerateContentCallable() {
    if (!generateContentCallable) {
        if (!firebaseInit.functions) {
            console.error("Firebase Functions not initialized when trying to get generateContent callable");
            throw new Error("Firebase Functions not initialized.");
        }
        generateContentCallable = httpsCallable(firebaseInit.functions, 'generateContent');
    }
    return generateContentCallable;
}

// Vytvorí HTML pre RAG výber (používa upload-handler)
function createDocumentSelectorUI() {
    return `
        <div class="mb-4">
            <label class="block font-medium text-slate-600 mb-2">Vyberte kontextové dokumenty (RAG):</label>
            <div class="space-y-2 border rounded-lg p-3 bg-slate-50">
                <ul id="selected-files-list-rag" class="text-xs text-slate-600 mb-2 list-disc list-inside">
                    {/* Zoznam sa načíta cez renderSelectedFiles */}
                    <li>Žádné soubory nevybrány.</li>
                </ul>
                <button id="select-files-btn-rag" class="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-1 px-2 rounded-md">
                    Vybrat soubory z knihovny
                </button>
            </div>
            <p class="text-xs text-slate-400 mt-1">Vybrané dokumenty budou použity jako dodatečný kontext pro AI.</p>
        </div>`;
}

// Stiahne obsah lekcie ako TXT
function handleDownloadLessonContent() {
    if (!currentLesson) {
        showToast("Lekce není načtena, nelze stáhnout obsah.", true);
        return;
    }

    let contentString = "";
    const title = currentLesson.title || "Nova_lekce";

    contentString += `# ${currentLesson.title || "Nová lekce"}\n`;
    if (currentLesson.subtitle) contentString += `## ${currentLesson.subtitle}\n`;
    contentString += `\n---\n\n`;

    // Poradie podľa vášho pôvodného kódu
    if (currentLesson.text_content) contentString += `### Text pro studenty\n\n${currentLesson.text_content}\n\n---\n\n`;
    if (currentLesson.presentation?.slides) contentString += `### Prezentace (Styl: ${currentLesson.presentation.styleId || 'default'})\n\n${currentLesson.presentation.slides.map((s, i) => `**Slide ${i + 1}: ${s.title}**\n${(s.points || []).map(p => `- ${p}`).join('\n')}\n`).join('\n')}\n---\n\n`;
    if (currentLesson.videoUrl) contentString += `### Video\n\n${currentLesson.videoUrl}\n\n---\n\n`;
    if (currentLesson.quiz?.questions) contentString += `### Kvíz\n\n${currentLesson.quiz.questions.map((q, i) => `${i + 1}. ${q.question_text}\n${(q.options || []).map((o, j) => `  - ${o}${j === q.correct_option_index ? " (Správně)" : ""}`).join('\n')}`).join('\n\n')}\n\n---\n\n`;
    if (currentLesson.test?.questions) contentString += `### Test\n\n${currentLesson.test.questions.map((q, i) => `${i + 1}. ${q.question_text}\n${(q.options || []).map((o, j) => `  - ${o}${j === q.correct_option_index ? " (Správně)" : ""}`).join('\n')}`).join('\n\n')}\n\n---\n\n`;
    if (currentLesson.podcast_script?.episodes) contentString += `### Podcast Skript\n\n${currentLesson.podcast_script.episodes.map((ep, i) => `**Epizoda ${i + 1}: ${ep.title}**\n\n${ep.script}\n\n`).join('')}---\n\n`;

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

// Vykreslí ľavé menu editora
export function renderEditorMenu(container, lesson) {
    currentLesson = lesson;
    lastGeneratedData = null; // Reset
    clearSelectedFiles('selected-files-list-rag'); // Vyčistíme RAG výber

    container.innerHTML = `
        <header class="p-4 border-b border-slate-200 flex-shrink-0">
            <button id="back-to-timeline-btn" class="flex items-center text-sm text-green-700 hover:underline mb-3">&larr; Zpět na plán výuky</button>
            <div class="flex justify-between items-start">
                <div class="flex items-center space-x-3">
                    <span class="text-3xl">${currentLesson?.icon || '🆕'}</span>
                    <h2 id="editor-lesson-title" class="text-xl font-bold truncate text-slate-800">${currentLesson ? currentLesson.title : 'Vytvořit novou lekci'}</h2>
                </div>
                <button id="download-lesson-btn" title="Stáhnout obsah lekce" class="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2 2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </button>
            </div>
        </header>
        <div class="flex-grow overflow-y-auto p-2"><nav id="editor-vertical-menu" class="flex flex-col space-y-1"></nav></div>`;

    container.querySelector('#back-to-timeline-btn').addEventListener('click', () => {
        // TODO: Zavolať funkciu z professor.js na zobrazenie timeline namiesto reloadu
        window.location.reload(); 
    });

    container.querySelector('#download-lesson-btn').addEventListener('click', handleDownloadLessonContent);

    const menuEl = container.querySelector('#editor-vertical-menu');
    const menuItems = [
        { id: 'details', label: 'Detaily lekce', icon: '📝' },
        { id: 'text', label: 'Text pro studenty', icon: '✍️' },
        { id: 'presentation', label: 'Prezentace', icon: '🖼️' },
        { id: 'video', label: 'Video', icon: '▶️' },
        { id: 'quiz', label: 'Kvíz', icon: '❓' },
        { id: 'test', label: 'Test', icon: '✅' },
        { id: 'post', label: 'Podcast Skript', icon: '🎙️' }, // Upravený label
    ];

    menuEl.innerHTML = menuItems.map(item => `<a href="#" data-view="${item.id}" class="editor-menu-item flex items-center p-3 text-sm font-medium rounded-md hover:bg-slate-100 transition-colors">${item.icon}<span class="ml-3">${item.label}</span></a>`).join('');

    menuEl.querySelectorAll('.editor-menu-item').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            menuEl.querySelectorAll('.editor-menu-item').forEach(i => i.classList.remove('bg-green-100', 'text-green-800', 'font-semibold'));
            item.classList.add('bg-green-100', 'text-green-800', 'font-semibold');
            showEditorContent(item.dataset.view); // Už neposielame lesson
        });
    });
    
    // Zobrazíme defaultne detaily lekcie
    const defaultItem = menuEl.querySelector('.editor-menu-item[data-view="details"]');
     if (defaultItem) {
         defaultItem.click(); // Simulujeme kliknutie
     } else {
         showEditorContent('details'); // Fallback
     }
}

// Vykreslí hlavnú editačnú plochu podľa výberu v menu
export async function showEditorContent(viewId) {
    const mainArea = document.getElementById('main-content-area');
    mainArea.innerHTML = `<div class="p-4 sm:p-6 md:p-8 overflow-y-auto h-full view-transition opacity-0" id="editor-content-container">Načítání...</div>`;
    const container = document.getElementById('editor-content-container');
    let contentHTML = '';

    const renderWrapper = (title, content, actions = '') => `
        <div class="flex justify-between items-start mb-6">
            <h2 class="text-3xl font-extrabold text-slate-800">${title}</h2>
            <div>${actions}</div>
        </div>
        <div class="bg-white p-6 rounded-2xl shadow-lg">${content}</div>`;
    
    const renderSavedContent = (title, field, renderFn) => {
        const deleteButton = `<button id="delete-content-btn" data-field="${field}" class="px-4 py-2 text-sm font-semibold text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors flex items-center gap-2">🗑️ Smazat a vytvořit nový</button>`;
        let renderedContent = '<div class="text-center p-8 text-slate-400">Pro tuto sekci zatím není uložen žádný obsah. Klikněte na "Smazat a vytvořit nový" pro aktivaci generátoru.</div>';
        if(currentLesson && currentLesson[field]) {
            try {
                 renderedContent = renderFn(currentLesson[field]);
             } catch (e) {
                  console.error(`Error rendering saved content for field ${field}:`, e);
                  renderedContent = `<div class="p-4 bg-red-100 text-red-700 rounded-lg">Chyba při zobrazování uloženého obsahu.</div>`;
             }
        }
        return renderWrapper(title, renderedContent, deleteButton);
    };

    const fieldMapping = { 
        'text': 'text_content', 
        'presentation': 'presentation', 
        'quiz': 'quiz', 
        'test': 'test', 
        'post': 'podcast_script',
        'video': 'videoUrl'
    };
    const currentField = fieldMapping[viewId];

    switch(viewId) {
        case 'details':
            contentHTML = renderWrapper('Detaily lekce', `
                <div id="lesson-details-form" class="space-y-4">
                    <div><label class="block font-medium text-slate-600">Název lekce</label><input type="text" id="lesson-title-input" class="w-full border-slate-300 rounded-lg p-2 mt-1 focus:ring-green-500 focus:border-green-500" value="${currentLesson?.title || ''}" placeholder="Např. Úvod do organické chemie"></div>
                    <div><label class="block font-medium text-slate-600">Podtitulek</label><input type="text" id="lesson-subtitle-input" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="${currentLesson?.subtitle || ''}" placeholder="Základní pojmy a principy"></div>
                    <div class="grid grid-cols-2 gap-4">
                        <div><label class="block font-medium text-slate-600">Číslo lekce</label><input type="text" id="lesson-number-input" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="${currentLesson?.number || ''}" placeholder="Např. 101"></div>
                        <div><label class="block font-medium text-slate-600">Ikona</label><input type="text" id="lesson-icon-input" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="${currentLesson?.icon || '🆕'}" placeholder="🆕"></div>
                    </div>
                    <div class="text-right pt-4"><button id="save-lesson-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105">Uložit změny</button></div>
                </div>`);
            break;
        case 'text':
            if (currentLesson?.[currentField]) {
                contentHTML = renderSavedContent('Text pro studenty', currentField, (data) => `<div class="prose max-w-none">${data.replace(/\n/g, '<br>')}</div>`);
            } else {
                contentHTML = renderWrapper('Text pro studenty', `
                    <p class="text-slate-500 mb-4">Zadejte AI prompt a vygenerujte hlavní studijní text. Můžete vybrat dokumenty (RAG).</p>
                    ${createDocumentSelectorUI()}
                    <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder="Např. 'Vytvoř poutavý úvodní text...'"></textarea>
                    <div class="flex items-center justify-end mt-4">
                        <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ai-glow">✨<span class="ml-2">Generovat text</span></button> 
                    </div>
                    <div id="generation-output" class="mt-6 border-t pt-6 text-slate-700 prose max-w-none">
                         <div class="text-center p-8 text-slate-400">Obsah se vygeneruje zde...</div>
                    </div>
                    <div class="text-right mt-4"><button id="save-content-btn" data-field="${currentField}" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105 hidden">Uložit do lekce</button></div>
                    `);
            }
            break;
        case 'presentation':
             if (currentLesson?.[currentField]) {
                // Vykreslíme uloženú prezentáciu pomocou renderGeneratedContent
                contentHTML = renderSavedContent('AI Prezentace', currentField, (data) => renderGeneratedContent('presentation', data)); 
             } else {
                contentHTML = renderWrapper('AI Prezentace', `
                    <p class="text-slate-500 mb-4">Zadejte téma a počet slidů. Můžete vybrat dokumenty (RAG).</p>
                    
                    ${createDocumentSelectorUI()}

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div class="md:col-span-2"><label class="block font-medium text-slate-600">Téma prezentace</label><input id="prompt-input" type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1" placeholder="Např. Klíčové momenty Římské republiky"></div>
                        <div><label class="block font-medium text-slate-600">Počet slidů</label><input id="slide-count-input" type="number" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="5"></div>
                    </div>
                    
                    <div class="mb-4">
                        <label for="presentation-style-selector" class="block text-sm font-medium text-gray-700 mb-1">Styl prezentace:</label>
                        <select id="presentation-style-selector" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                            <option value="default">Výchozí (Zelená)</option>
                            <option value="modern">Moderní (Modrá)</option>
                            <option value="vibrant">Živý (Oranžová)</option>
                        </select>
                    </div>
                    
                    <div class="text-right mt-4">
                         <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ml-auto ai-glow">✨<span class="ml-2">Generovat prezentaci</span></button>
                    </div>
                    <div id="generation-output" class="mt-6 border-t pt-6">
                        <div class="text-center p-8 text-slate-400">Náhled prezentace se zobrazí zde...</div>
                    </div>
                    <div class="text-right mt-4"><button id="save-content-btn" data-field="${currentField}" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105 hidden">Uložit do lekce</button></div>
                    `);
             }
            break;
        case 'video':
             contentHTML = renderWrapper('Vložení videa', `
                <p class="text-slate-500 mb-4">Vložte odkaz na video z YouTube.</p>
                <div><label class="block font-medium text-slate-600">YouTube URL</label><input id="youtube-url" type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="${currentLesson?.videoUrl || ''}" placeholder="https://www.youtube.com/watch?v=..."></div>
                <div class="text-right pt-4">
                    ${currentLesson?.videoUrl ? '<button id="delete-content-btn" data-field="videoUrl" class="px-4 py-2 text-sm font-semibold text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors mr-2">🗑️ Smazat video</button>' : ''}
                    <button id="embed-video-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800">Uložit odkaz</button>
                </div>
                <div id="video-preview" class="mt-6 border-t pt-6">
                    ${currentLesson?.videoUrl ? '' : '<div class="text-center p-8 text-slate-400">Náhled videa se zobrazí zde...</div>'}
                </div>`);
            break;
        case 'quiz':
            if (currentLesson?.[currentField]) {
                contentHTML = renderSavedContent('Interaktivní Kvíz', currentField, (data) => renderGeneratedContent('quiz', data));
            } else {
                contentHTML = renderWrapper('Interaktivní Kvíz', `
                    <p class="text-slate-500 mb-4">Vytvořte rychlý kvíz. Můžete vybrat dokumenty (RAG).</p>
                    ${createDocumentSelectorUI()}
                    <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder="Např. 'Vytvoř 3 otázky s výběrem ze 4 možností...'"></textarea>
                    <div class="text-right mt-4">
                         <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ml-auto ai-glow">✨<span class="ml-2">Vygenerovat kvíz</span></button>
                    </div>
                    <div id="generation-output" class="mt-6 border-t pt-6">
                        <div class="text-center p-8 text-slate-400">Náhled kvízu se zobrazí zde...</div>
                    </div>
                    <div class="text-right mt-4"><button id="save-content-btn" data-field="${currentField}" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105 hidden">Uložit do lekce</button></div>
                    `);
            }
            break;
        case 'test':
             if (currentLesson?.[currentField]) {
                contentHTML = renderSavedContent('Pokročilý Test', currentField, (data) => renderGeneratedContent('test', data));
             } else {
                contentHTML = renderWrapper('Pokročilý Test', `
                    <p class="text-slate-500 mb-4">Navrhněte komplexnější test. Můžete vybrat dokumenty (RAG).</p>
                    ${createDocumentSelectorUI()}
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div><label class="block font-medium text-slate-600">Počet otázek</label><input id="question-count-input" type="number" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="5"></div>
                        <div>
                            <label class="block font-medium text-slate-600">Obtížnost</label>
                            <select id="difficulty-select" class="w-full border-slate-300 rounded-lg p-2 mt-1"><option>Lehká</option><option selected>Střední</option><option>Těžká</option></select>
                        </div>
                        <div>
                            <label class="block font-medium text-slate-600">Typy otázek</label>
                            <select id="type-select" class="w-full border-slate-300 rounded-lg p-2 mt-1"><option value="Multiple Choice">Výběr z možností</option></select>
                        </div>
                    </div>
                    <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder="Zadejte hlavní téma testu..."></textarea>
                    <div class="text-right mt-4">
                         <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ml-auto ai-glow">✨<span class="ml-2">Vygenerovat test</span></button>
                    </div>
                    <div id="generation-output" class="mt-6 border-t pt-6">
                        <div class="text-center p-8 text-slate-400">Náhled testu se zobrazí zde...</div>
                    </div>
                    <div class="text-right mt-4"><button id="save-content-btn" data-field="${currentField}" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105 hidden">Uložit do lekce</button></div>
                    `);
             }
            break;
        case 'post': // Podcast Script
            if (currentLesson?.[currentField]) {
                contentHTML = renderSavedContent('Podcast Skript', currentField, (data) => renderGeneratedContent('post', data));
            } else {
                contentHTML = renderWrapper('Podcast Skript', `
                    <p class="text-slate-500 mb-4">Vytvořte sérii podcastových skriptů. Můžete vybrat dokumenty (RAG).</p>
                    ${createDocumentSelectorUI()}
                    <div class="bg-slate-50 p-4 rounded-lg">
                        <h4 class="font-bold text-slate-800 mb-3">🎙️ Generátor Podcastové Série</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label class="block font-medium text-slate-600 text-sm">Počet epizod</label>
                                <input id="episode-count-input" type="number" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="3">
                            </div>
                           {/* Hlas a jazyk zatiaľ AI nepodporuje */}
                        </div>
                        <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-20" placeholder="Zadejte hlavní téma...">${'Prozkoumej klíčové koncepty z lekce "' + (currentLesson?.title || 'aktuální lekce') + '"'}</textarea>
                        <div class="text-right mt-4">
                            <button id="generate-btn" data-type="podcast" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ml-auto ai-glow">✨<span class="ml-2">Vytvořit skripty</span></button>
                        </div>
                    </div>
                     <div id="generation-output" class="mt-6 border-t pt-6">
                        <div class="text-center p-8 text-slate-400">Vygenerovaný obsah se zobrazí zde...</div>
                    </div>
                    <div class="text-right mt-4"><button id="save-content-btn" data-field="${currentField}" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105 hidden">Uložit do lekce</button></div>
                `);
            }
            break;
        default:
            contentHTML = renderWrapper(viewId, `<div class="text-center p-8 text-slate-400">Tato sekce se připravuje.</div>`);
    }

    container.innerHTML = contentHTML;
    // Počkáme krátko a pridáme listenery + RAG + transition
     setTimeout(() => {
          attachEditorEventListeners(viewId);
          renderSelectedFiles('selected-files-list-rag'); // Aktualizujeme RAG zoznam
          const ragSelectBtn = document.getElementById('select-files-btn-rag');
          if (ragSelectBtn) {
               ragSelectBtn.addEventListener('click', () => {
                   // TODO: Otvoriť modal na výber súborov z knižnice
                   showToast("Funkce výběru souborů pro RAG zatím není implementována.");
               });
          }
          // Prezentácia - nastavíme style selector, ak existuje uložená hodnota
          if (viewId === 'presentation' && currentLesson?.presentation?.styleId) {
             const selector = document.getElementById('presentation-style-selector');
             if (selector) selector.value = currentLesson.presentation.styleId;
          }
           // Aplikujeme transition
           requestAnimationFrame(() => container.classList.remove('opacity-0'));
     }, 50); 
}

// Pridá listenery pre aktuálne zobrazený editor
function attachEditorEventListeners(viewId) {
    // Uloženie detailov lekcie (len pre 'details' view)
    if (viewId === 'details') {
        document.getElementById('save-lesson-btn')?.addEventListener('click', handleSaveLessonDetails);
    }
    
    // Mazanie existujúceho obsahu
    const deleteBtn = document.getElementById('delete-content-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            const field = deleteBtn.dataset.field;
            handleDeleteGeneratedContent(field, viewId);
        });
    }

    // Špecifické pre video
    if (viewId === 'video') {
        const embedBtn = document.getElementById('embed-video-btn');
        const urlInput = document.getElementById('youtube-url');
        const preview = document.getElementById('video-preview');

        const showVideoPreview = (url) => { /* ... kód showVideoPreview zostáva rovnaký ... */ 
            if (!url) {
                preview.innerHTML = '<div class="text-center p-8 text-slate-400">Náhled videa se zobrazí zde...</div>';
                return false;
            }
            const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?#]+)/);
            const videoId = videoIdMatch ? videoIdMatch[1] : null;
            if (videoId) {
                preview.innerHTML = `<div class="rounded-xl overflow-hidden aspect-video mx-auto max-w-2xl shadow-lg"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="w-full h-full"></iframe></div>`;
                return true;
            } else {
                preview.innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg text-center">Neplatná YouTube URL.</div>`;
                return false;
            }
        };

        embedBtn?.addEventListener('click', async () => {
            const url = urlInput ? urlInput.value.trim() : '';
            if (showVideoPreview(url)) { // Ak je URL platná, uložíme
                await handleSaveGeneratedContent('videoUrl', url); 
            } else if (url === '') { // Ak je pole prázdne, chápeme to ako žiadosť o zmazanie
                await handleDeleteGeneratedContent('videoUrl', viewId);
            } else {
                 showToast("Zadajte platnú YouTube URL adresu.", true);
            }
        });
        
        // Zobraziť náhľad pre existujúcu URL pri načítaní
        if (currentLesson?.videoUrl) {
            showVideoPreview(currentLesson.videoUrl);
        }
    }

    // Tlačidlo Generovať
    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', () => handleGeneration(viewId));
    }

    // Tlačidlo Uložiť vygenerovaný obsah
    const saveContentBtn = document.getElementById('save-content-btn');
    if(saveContentBtn) {
        saveContentBtn.addEventListener('click', () => {
             const field = saveContentBtn.dataset.field;
             handleSaveGeneratedContent(field, lastGeneratedData);
        });
    }
}

// Uloží základné detaily lekcie (názov, ikona...)
async function handleSaveLessonDetails() { // Premenovaná funkcia
    const titleInput = document.getElementById('lesson-title-input');
    const subtitleInput = document.getElementById('lesson-subtitle-input');
    const numberInput = document.getElementById('lesson-number-input');
    const iconInput = document.getElementById('lesson-icon-input');
    const saveBtn = document.getElementById('save-lesson-btn'); // Tento save button je v sekcii details

    if (!titleInput || !saveBtn) {
         showToast("Chyba: Chybějící elementy formuláře.", true);
         return;
    }

    const title = titleInput.value.trim();
    if (!title) {
        showToast("Název lekce nemůže být prázdný.", true);
        return;
    }

    const lessonData = {
        title: title,
        subtitle: subtitleInput ? subtitleInput.value.trim() : '',
        number: numberInput ? numberInput.value.trim() : '',
        icon: iconInput ? (iconInput.value.trim() || '🆕') : '🆕',
        updatedAt: serverTimestamp() // Vždy aktualizujeme čas
    };

    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<div class="spinner"></div>`; // Jednoduchý spinner

    try {
        if (currentLesson && currentLesson.id) {
            // Aktualizácia existujúcej lekcie
            await updateDoc(doc(firebaseInit.db, 'lessons', currentLesson.id), lessonData);
            // Aktualizujeme aj globálnu premennú
            currentLesson = { ...currentLesson, ...lessonData }; 
            showToast("Detaily lekce byly úspěšně aktualizovány.");
            // Aktualizujeme aj názov v ľavom menu
            document.getElementById('editor-lesson-title').textContent = lessonData.title;
        } else {
            // Vytvorenie novej lekcie
            lessonData.createdAt = serverTimestamp(); // Pridáme čas vytvorenia
            const docRef = await addDoc(collection(firebaseInit.db, 'lessons'), lessonData);
            currentLesson = { id: docRef.id, ...lessonData }; // Uložíme si novú lekciu
            showToast("Nová lekce byla úspěšně vytvořena.");
            // Aktualizujeme UI editora
            document.getElementById('editor-lesson-title').textContent = lessonData.title;
            // TODO: Oznámiť zmene v knižnici lekcií
             console.log("New lesson created, library refresh needed.");
            // window.dispatchEvent(new CustomEvent('lessonSaved', { detail: { newLesson: true, lesson: currentLesson } }));
        }
    } catch (error) {
        console.error("Error saving lesson details:", error);
        showToast("Při ukládání detailů lekce došlo k chybě.", true);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    }
}


// Generuje obsah pomocou AI
async function handleGeneration(viewId) {
    const outputEl = document.getElementById('generation-output');
    const promptInput = document.getElementById('prompt-input');
    const generateBtn = document.getElementById('generate-btn');
    const userPrompt = promptInput ? promptInput.value.trim() : '';
    
    if (!outputEl || !generateBtn) {
         console.error("Chybějící output nebo generate button element!");
         return;
    }
    if (promptInput && !userPrompt) {
        outputEl.innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg">Prosím, zadejte text do promptu.</div>`;
        return;
    }

    const originalText = generateBtn.innerHTML;
    generateBtn.innerHTML = `<div class="spinner"></div><span class="ml-2">Generuji...</span>`;
    generateBtn.disabled = true;
    if (promptInput) promptInput.disabled = true;
    outputEl.innerHTML = `<div class="p-8 text-center pulse-loader text-slate-500">🤖 AI Sensei přemýšlí a tvoří obsah...</div>`;

    lastGeneratedData = null; // Reset pred generovaním

    try {
        // Získanie vybraných RAG súborov
        const selectedFiles = getSelectedFiles(); // Z upload-handler.js
        const filePaths = selectedFiles.map(f => f.fullPath);
        console.log("Using files for RAG:", filePaths); // Logovanie

        // Získanie špecifických parametrov pre generovanie
        const promptData = { userPrompt };
        switch (viewId) {
            case 'presentation':
                promptData.slideCount = document.getElementById('slide-count-input')?.value || 5;
                break;
            case 'test':
                promptData.questionCount = document.getElementById('question-count-input')?.value || 5;
                promptData.difficulty = document.getElementById('difficulty-select')?.value || 'Střední';
                promptData.questionTypes = document.getElementById('type-select')?.value || 'Multiple Choice';
                break;
            case 'post':
                promptData.episodeCount = document.getElementById('episode-count-input')?.value || 3;
                break;
        }

        // Volanie backend funkcie
        const generateContent = getGenerateContentCallable(); // Použijeme lazy-loaded funkciu
        const result = await generateContent({
            contentType: viewId,
            promptData,
            filePaths, // Posielame cesty k súborom
        });
        
        // Spracovanie výsledku
        if (!result || !result.data) {
             throw new Error("AI nevrátila žádná data.");
        }
        if (result.data.error) { // Backend môže vrátiť chybu
            throw new Error(result.data.error);
        }
        
        // Uloženie surového výsledku pre tlačidlo "Uložiť"
        // Pre text ukladáme priamo text, pre ostatné celý objekt
        lastGeneratedData = (viewId === 'text' && result.data.text) ? result.data.text : result.data; 
        
        // Zobrazenie náhľadu
        outputEl.innerHTML = renderGeneratedContent(viewId, result.data); // Posielame result.data

        // Zobrazenie tlačidla "Uložiť"
        const saveBtn = document.getElementById('save-content-btn');
        if (saveBtn) {
            // Nastavenie správneho field pre uloženie
             const fieldMapping = { 
                 'text': 'text_content', 
                 'presentation': 'presentation', 
                 'quiz': 'quiz', 
                 'test': 'test', 
                 'post': 'podcast_script' 
             };
            saveBtn.dataset.field = fieldMapping[viewId];
            saveBtn.classList.remove('hidden');
        } else {
             console.warn("Save button not found after generation.");
        }

    } catch (e) {
        console.error("Error during AI generation:", e);
        outputEl.innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg">Došlo k chybě: ${e.message || e}</div>`;
        lastGeneratedData = null; // Reset v prípade chyby
    } finally {
        generateBtn.innerHTML = originalText;
        generateBtn.disabled = false;
        if (promptInput) promptInput.disabled = false;
    }
}

// Vykreslí náhľad vygenerovaného alebo uloženého obsahu
function renderGeneratedContent(viewId, data) { // Názov premennej zmenený na 'data'
    if (!data) {
        return `<div class="p-4 bg-red-100 text-red-700 rounded-lg">Došlo k chybě: Nebyla přijata žádná data k zobrazení.</div>`;
    }

    try {
        switch(viewId) {
            case 'text':
                 // Ak 'data' je string (z uloženia) alebo objekt s 'text' (z generovania)
                const textContent = (typeof data === 'string') ? data : data.text; 
                if (typeof textContent !== 'string') throw new Error("Data neobsahují platný text.");
                // Použijeme <pre> pre zachovanie formátovania, ale s 'whitespace-pre-wrap' pre zalomenie
                return `<pre class="whitespace-pre-wrap font-sans text-sm">${textContent}</pre>`; 
            case 'presentation':
                 // Data by mali byť objekt { styleId: '...', slides: [...] }
                 // alebo objekt { slides: [...] } priamo z generátora
                 const slides = data?.slides || [];
                 // Pri zobrazení uloženého obsahu vezmeme styleId z dát.
                 // Pri zobrazení *náhľadu* po generovaní vezmeme styleId z <select>
                 let styleId;
                 if (data?.styleId) {
                     styleId = data.styleId; // Z uložených dát
                 } else {
                     const selector = document.getElementById('presentation-style-selector');
                     styleId = selector ? selector.value : 'default'; // Z aktuálneho <select> pre náhľad
                 }

                 if (!Array.isArray(slides)) throw new Error("Data neobsahují platné pole 'slides'.");
                 return slides.map((slide, i) => `
                    <div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm bg-slate-50 relative">
                        <h4 class="font-bold text-green-700">Slide ${i+1}: ${slide.title || 'Bez názvu'}</h4>
                        <ul class="list-disc list-inside mt-2 text-sm text-slate-600">
                            ${(Array.isArray(slide.points) ? slide.points : []).map(p => `<li>${p}</li>`).join('')}
                        </ul>
                         <span class="style-indicator text-xs font-mono text-gray-400 absolute top-1 right-2">${styleId}</span> 
                    </div>`).join('');
            case 'quiz':
            case 'test':
                 if (!Array.isArray(data?.questions)) throw new Error("Data neobsahují platné pole 'questions'.");
                 return data.questions.map((q, i) => {
                    const optionsHtml = (q.options || []).map((opt, j) => `<div class="text-sm p-2 rounded-lg ${j === q.correct_option_index ? 'bg-green-100 font-semibold' : 'bg-slate-50'}">${opt}</div>`).join('');
                    return `<div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm">
                                <h4 class="font-bold text-green-700">Otázka ${i+1}: ${q.question_text || 'Chybějící text'}</h4>
                                <div class="mt-2 space-y-2">${optionsHtml}</div>
                            </div>`;
                }).join('');
            case 'post': // Podcast Script
                if (!Array.isArray(data?.episodes)) throw new Error("Data neobsahují platné pole 'episodes'.");
                 return data.episodes.map((episode, i) => `
                    <div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm">
                        <h4 class="font-bold text-green-700">Epizoda ${i+1}: ${episode.title || 'Bez názvu'}</h4>
                        {/* Použijeme <pre> pre zachovanie formátovania skriptu */}
                        <pre class="mt-2 text-sm text-slate-600 whitespace-pre-wrap font-sans">${episode.script || ''}</pre> 
                    </div>`).join('');
            default:
                return `<div class="p-4 bg-yellow-100 text-yellow-700 rounded-lg">Neznámý typ obsahu '${viewId}' pro zobrazení.</div>`;
        }
    } catch(e) {
        console.error("Error rendering content:", e);
        console.error("Received data that caused the error:", data); // Vypíšeme, čo prišlo
        return `<div class="p-4 bg-red-100 text-red-700 rounded-lg">Došlo k chybě při zobrazování obsahu: ${e.message}</div>`;
    }
}

// Uloží vygenerovaný obsah do aktuálnej lekcie
async function handleSaveGeneratedContent(fieldToUpdate, contentToSave) {
    const saveBtn = document.getElementById('save-content-btn');
    
    // Ak lekcia ešte neexistuje, najprv uložíme detaily
    if (!currentLesson || !currentLesson.id) {
        showToast("Nejprve uložte detaily lekce pomocí tlačítka 'Uložit změny' v sekci Detaily.", true);
         return;
    }

    if (!contentToSave && fieldToUpdate !== 'videoUrl') { // Pre video je prázdny string platný (zmazanie)
        showToast("Není co uložit. Vygenerujte prosím nejprve obsah.", true);
        return;
    }

    const lessonRef = doc(firebaseInit.db, 'lessons', currentLesson.id);
    const originalText = saveBtn ? saveBtn.innerHTML : 'Uložit do lekce';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<div class="spinner"></div>`; // Spinner v tlačidle
    }

    try {
        let dataToSave;
        
        // Špeciálne ošetrenie pre prezentáciu - pridáme/aktualizujeme styleId
        if (fieldToUpdate === 'presentation') {
             const styleSelector = document.getElementById('presentation-style-selector');
             const selectedStyleId = styleSelector ? styleSelector.value : 'default';
             // Uistíme sa, že contentToSave (lastGeneratedData) je objekt a má pole slides
             if (typeof contentToSave === 'object' && Array.isArray(contentToSave.slides)) {
                  dataToSave = { 
                      styleId: selectedStyleId, 
                      slides: contentToSave.slides 
                  };
             } else {
                  // Fallback, ak by 'contentToSave' nemal správnu štruktúru
                  console.error("Invalid structure for contentToSave in presentation:", contentToSave);
                  showToast("Chyba: Nepodařilo se získat data slidů pro uložení.", true);
                  if (saveBtn) { // Obnovíme tlačidlo
                      saveBtn.disabled = false;
                      saveBtn.innerHTML = originalText;
                  }
                  return; // Zastavíme ukladanie
             }
        } 
        // Pre text berieme len pole 'text', ak prišlo v objekte
        else if (fieldToUpdate === 'text_content' && typeof contentToSave === 'object' && contentToSave.text) {
             dataToSave = contentToSave.text;
        } 
        // Pre videoUrl berieme priamo string
        else if (fieldToUpdate === 'videoUrl') {
            dataToSave = (typeof contentToSave === 'string') ? contentToSave.trim() : null;
        }
        // Pre ostatné JSON typy (quiz, test, post) berieme celý objekt
        else {
             dataToSave = contentToSave;
        }

        // Vytvoríme objekt pre updateDoc, ktorý obsahuje iba pole, ktoré chceme aktualizovať
        const updateData = { updatedAt: serverTimestamp() };
        updateData[fieldToUpdate] = dataToSave;
        
        // Poznámka: Pôvodná logika tu mazala VŠETKY ostatné polia. 
        // Ak chceš, aby uloženie prezentácie zmazalo text, musíš to explicitne
        // odkomentovať alebo upraviť. Momentálne to ukladá len toto jedno pole
        // a ostatné necháva tak.

        /*
        const allContentFields = ['text_content', 'presentation', 'quiz', 'test', 'podcast_script', 'videoUrl'];
        allContentFields.forEach(field => {
             if (field !== fieldToUpdate) {
                  updateData[field] = deleteField(); // Označí ostatné polia na zmazanie
             }
         });
        */

        await updateDoc(lessonRef, updateData);

        // Aktualizujeme lokálny currentLesson
        if (currentLesson) {
             currentLesson[fieldToUpdate] = dataToSave;
             // Ak si odkomentoval logiku mazania vyššie, odkomentuj aj toto:
             /*
             allContentFields.forEach(field => {
                  if (field !== fieldToUpdate) delete currentLesson[field];
             });
             */
             currentLesson.updatedAt = new Date(); // Približný čas
        }
        
        showToast("Obsah byl úspěšně uložen do lekce.");
        
        // Znovu zobrazíme aktuálny pohľad s uloženými dátami
        const currentViewId = document.querySelector('.editor-menu-item.bg-green-100')?.dataset.view;
        if (currentViewId) {
            showEditorContent(currentViewId);
        }

    } catch (error) {
        console.error(`Chyba při ukládání obsahu (${fieldToUpdate}) do lekce:`, error);
        showToast("Při ukládání obsahu došlo k chybě.", true);
         if (saveBtn) { // Obnovíme tlačidlo len v prípade chyby
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    }
}

// Zmaže vygenerovaný obsah z lekcie
async function handleDeleteGeneratedContent(fieldToDelete, viewId) {
    if (!currentLesson || !currentLesson.id) {
        showToast("Lekce není uložena, nelze mazat obsah.", true);
        return;
    }
    if (!confirm(`Opravdu si přejete smazat ${viewId === 'video' ? 'odkaz na video' : 'tento obsah'} a aktivovat generátor/editor?`)) {
        return;
    }

    const deleteBtn = document.getElementById('delete-content-btn');
    const originalText = deleteBtn ? deleteBtn.innerHTML : '🗑️ Smazat...';
    if(deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = `<div class="spinner-dark"></div> Mazání...`;
    }

    try {
        const lessonRef = doc(firebaseInit.db, 'lessons', currentLesson.id);
        // Použijeme deleteField() na odstránenie poľa z dokumentu
        await updateDoc(lessonRef, {
            [fieldToDelete]: deleteField(),
            updatedAt: serverTimestamp() // Aktualizujeme čas úpravy
        });
        
        // Odstránime pole aj z lokálnej kópie
        delete currentLesson[fieldToDelete];
        currentLesson.updatedAt = new Date(); // Približný čas
        
        showToast("Obsah byl úspěšně smazán.");
        
        // Znovu zobrazíme editor pre daný viewId, ktorý by teraz mal ukázať formulár
        showEditorContent(viewId);

    } catch (error) {
        console.error("Chyba při mazání obsahu:", error);
        showToast("Při mazání obsahu došlo k chybě.", true);
        if(deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = originalText;
        }
    }
}
