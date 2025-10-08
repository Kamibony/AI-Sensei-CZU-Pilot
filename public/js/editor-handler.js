import { doc, addDoc, updateDoc, collection, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from './firebase-init.js';
import { showToast } from './utils.js';
import { callGeminiApi, callGeminiForJson, callGenerateFromDocument } from './gemini-api.js';
import { initializeUpload } from './upload-handler.js';

let currentLesson = null;

export function renderEditorMenu(container, lesson) {
    currentLesson = lesson;
    container.innerHTML = `
        <header class="p-4 border-b border-slate-200 flex-shrink-0">
            <button id="back-to-timeline-btn" class="flex items-center text-sm text-green-700 hover:underline mb-3">&larr; Zpět na plán výuky</button>
            <div class="flex items-center space-x-3">
                <span class="text-3xl">${currentLesson ? currentLesson.icon : '🆕'}</span>
                <h2 id="editor-lesson-title" class="text-xl font-bold truncate text-slate-800">${currentLesson ? currentLesson.title : 'Vytvořit novou lekci'}</h2>
            </div>
        </header>
        <div class="flex-grow overflow-y-auto p-2"><nav id="editor-vertical-menu" class="flex flex-col space-y-1"></nav></div>`;

    container.querySelector('#back-to-timeline-btn').addEventListener('click', () => {
        // Reload the page to go back to the default timeline view, breaking the circular dependency.
        window.location.reload();
    });

    const menuEl = container.querySelector('#editor-vertical-menu');
    const menuItems = [
        { id: 'details', label: 'Detaily lekce', icon: '📝' },
        { id: 'docs', label: 'Dokumenty k lekci', icon: '📁' }, { id: 'text', label: 'Text pro studenty', icon: '✍️' },
        { id: 'presentation', label: 'Prezentace', icon: '🖼️' }, { id: 'video', label: 'Video', icon: '▶️' },
        { id: 'quiz', label: 'Kvíz', icon: '❓' }, { id: 'test', label: 'Test', icon: '✅' }, { id: 'post', label: 'Podcast & Materiály', icon: '🎙️' },
    ];

    menuEl.innerHTML = menuItems.map(item => `<a href="#" data-view="${item.id}" class="editor-menu-item flex items-center p-3 text-sm font-medium rounded-md hover:bg-slate-100 transition-colors">${item.icon}<span class="ml-3">${item.label}</span></a>`).join('');

    menuEl.querySelectorAll('.editor-menu-item').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            menuEl.querySelectorAll('.editor-menu-item').forEach(i => i.classList.remove('bg-green-100', 'text-green-800', 'font-semibold'));
            item.classList.add('bg-green-100', 'text-green-800', 'font-semibold');
            showEditorContent(item.dataset.view, currentLesson);
        });
    });
    // Programmatically click the first item to show the default view
    menuEl.querySelector('.editor-menu-item[data-view="details"]').click();
}

async function createDocumentSelector(lessonId) {
    if (!lessonId) {
        return `<div class="mb-4 p-3 bg-slate-100 text-slate-600 rounded-lg text-sm">Uložte prosím detaily lekce, abyste mohli nahrávat a vybírat dokumenty.</div>`;
    }
    const documentsCollectionRef = collection(db, 'lessons', lessonId, 'documents');
    try {
        const querySnapshot = await getDocs(documentsCollectionRef);
        if (querySnapshot.empty) {
            return `<div class="mb-4 p-3 bg-yellow-100 text-yellow-800 rounded-lg text-sm">Pro využití RAG prosím nahrajte nejprve nějaký dokument v sekci 'Dokumenty k lekci'.</div>`;
        }
        const options = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return `<option value="${data.storagePath}">${data.fileName}</option>`;
        }).join('');
        return `
            <div class="mb-4">
                <label for="document-select" class="block font-medium text-slate-600 mb-1">Vyberte kontextový dokument (RAG):</label>
                <select id="document-select" class="w-full border-slate-300 rounded-lg p-2 mt-1 focus:ring-green-500 focus:border-green-500">
                    ${options}
                </select>
            </div>`;
    } catch (error) {
        console.error("Chyba při načítání dokumentů pro selektor:", error);
        showToast("Nepodařilo se načíst dokumenty pro RAG.", true);
        return `<div class="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">Nepodařilo se načíst dokumenty.</div>`;
    }
}

export async function showEditorContent(viewId, lesson) {
    currentLesson = lesson;
    const mainArea = document.getElementById('main-content-area');
    mainArea.innerHTML = `<div class="p-4 sm:p-6 md:p-8 overflow-y-auto h-full view-transition" id="editor-content-container"></div>`;
    const container = document.getElementById('editor-content-container');
    let contentHTML = '';
    const lessonId = currentLesson ? currentLesson.id : null;

    const renderWrapper = (title, content) => `<h2 class="text-3xl font-extrabold text-slate-800 mb-6">${title}</h2><div class="bg-white p-6 rounded-2xl shadow-lg">${content}</div>`;

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
        case 'docs':
            contentHTML = renderWrapper('Dokumenty k lekci', `
                <p class="text-slate-500 mb-4">Nahrajte specifické soubory pro tuto lekci (např. sylabus, doplňkové texty).</p>
                <div id="upload-zone" class="upload-zone rounded-lg p-10 text-center text-slate-500 cursor-pointer"><p class="font-semibold">Přetáhněte soubory sem nebo klikněte pro výběr</p><p class="text-sm">Maximální velikost 10MB</p></div>
                <input type="file" id="file-upload-input" multiple class="hidden">
                <div id="upload-progress" class="mt-4 space-y-2"></div>
                <h3 class="font-bold text-slate-700 mt-6 mb-2">Nahrané soubory:</h3>
                <ul id="documents-list" class="space-y-2"><li>Načítám...</li></ul>`);
            break;
        case 'text':
            contentHTML = renderWrapper('Text pro studenty', `
                <p class="text-slate-500 mb-4">Zadejte AI prompt a vygenerujte hlavní studijní text pro tuto lekci. Můžete vybrat dokument, ze kterého bude AI čerpat informace (RAG).</p>
                ${await createDocumentSelector(lessonId)}
                <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder="Např. 'Vytvoř poutavý úvodní text o principech kvantové mechaniky pro úplné začátečníky. Zmiň Schrödingera, Heisenberga a princip superpozice.'"></textarea>
                <div class="flex items-center justify-between mt-4">
                    <div class="flex items-center space-x-4">
                        <label class="font-medium">Délka:</label>
                        <select id="length-select" class="rounded-lg border-slate-300"><option>Krátký</option><option selected>Střední</option><option>Dlouhý</option></select>
                    </div>
                    <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ai-glow">✨<span class="ml-2">Generovat text</span></button>
                </div>
                <div id="generation-output" class="mt-6 border-t pt-6 text-slate-700 prose max-w-none">
                     ${currentLesson?.content ? currentLesson.content.replace(/\n/g, '<br>') : '<div class="text-center p-8 text-slate-400">Obsah se vygeneruje zde...</div>'}
                </div>
                <div class="text-right mt-4"><button id="save-content-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105">Uložit do lekce</button></div>
                `);
            break;
        case 'presentation':
             contentHTML = renderWrapper('AI Prezentace', `
                <p class="text-slate-500 mb-4">Zadejte téma a počet slidů pro vygenerování prezentace. Můžete vybrat dokument, ze kterého bude AI čerpat informace (RAG).</p>
                ${await createDocumentSelector(lessonId)}
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="md:col-span-2"><label class="block font-medium text-slate-600">Téma prezentace</label><input id="prompt-input" type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1" placeholder="Např. Klíčové momenty Římské republiky"></div>
                    <div><label class="block font-medium text-slate-600">Počet slidů</label><input id="slide-count-input" type="number" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="3"></div>
                </div>
                <div class="text-right mt-4">
                     <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ml-auto ai-glow">✨<span class="ml-2">Generovat prezentaci</span></button>
                </div>
                <div id="generation-output" class="mt-6 border-t pt-6">
                    <div class="text-center p-8 text-slate-400">Náhled prezentace se zobrazí zde...</div>
                </div>
                <div class="text-right mt-4"><button id="save-content-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105 hidden">Uložit do lekce</button></div>
                `);
            break;
        case 'video':
            contentHTML = renderWrapper('Vložení videa', `
                <p class="text-slate-500 mb-4">Vložte odkaz na video z YouTube, které se zobrazí studentům v jejich panelu.</p>
                <div><label class="block font-medium text-slate-600">YouTube URL</label><input id="youtube-url" type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="${currentLesson?.videoUrl || ''}" placeholder="https://www.youtube.com/watch?v=i-z_I1_Z2lY"></div>
                <div class="text-right pt-4"><button id="embed-video-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800">Vložit video</button></div>
                <div id="video-preview" class="mt-6 border-t pt-6">
                    <div class="text-center p-8 text-slate-400">Náhled videa se zobrazí zde...</div>
                </div>`);
            break;
        case 'quiz':
            contentHTML = renderWrapper('Interaktivní Kvíz', `
                <p class="text-slate-500 mb-4">Vytvořte rychlý kvíz pro studenty. Otázky se objeví v jejich chatovacím rozhraní. Můžete vybrat dokument, ze kterého bude AI čerpat informace (RAG).</p>
                ${await createDocumentSelector(lessonId)}
                <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder="Např. 'Vytvoř 1 otázku s výběrem ze 3 možností na téma kvantová mechanika. Označ správnou odpověď.'"></textarea>
                <div class="text-right mt-4">
                     <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ml-auto ai-glow">✨<span class="ml-2">Vygenerovat kvíz</span></button>
                </div>
                <div id="generation-output" class="mt-6 border-t pt-6">
                    <div class="text-center p-8 text-slate-400">Náhled kvízu se zobrazí zde...</div>
                </div>
                <div class="text-right mt-4"><button id="save-content-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105 hidden">Uložit do lekce</button></div>
                `);
            break;
        case 'test':
             contentHTML = renderWrapper('Pokročilý Test', `
                <p class="text-slate-500 mb-4">Navrhněte komplexnější test pro studenty. Můžete vybrat dokument, ze kterého bude AI čerpat informace (RAG).</p>
                ${await createDocumentSelector(lessonId)}
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div><label class="block font-medium text-slate-600">Počet otázek</label><input id="question-count-input" type="number" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="2"></div>
                    <div>
                        <label class="block font-medium text-slate-600">Obtížnost</label>
                        <select id="difficulty-select" class="w-full border-slate-300 rounded-lg p-2 mt-1"><option>Lehká</option><option selected>Střední</option><option>Těžká</option></select>
                    </div>
                    <div>
                        <label class="block font-medium text-slate-600">Typy otázek</label>
                        <select id="type-select" class="w-full border-slate-300 rounded-lg p-2 mt-1"><option>Mix (výběr + pravda/nepravda)</option><option>Výběr z možností</option><option>Pravda/Nepravda</option></select>
                    </div>
                </div>
                <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder="Zadejte hlavní téma testu, např. 'Klíčové události a postavy Římské republiky od jejího založení po vznik císařství.'"></textarea>
                <div class="text-right mt-4">
                     <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ml-auto ai-glow">✨<span class="ml-2">Vygenerovat test</span></button>
                </div>
                <div id="generation-output" class="mt-6 border-t pt-6">
                    <div class="text-center p-8 text-slate-400">Náhled testu se zobrazí zde...</div>
                </div>
                <div class="text-right mt-4"><button id="save-content-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105 hidden">Uložit do lekce</button></div>
                `);
            break;
        case 'post':
            contentHTML = renderWrapper('Podcast & Doplňkové materiály', `
                <p class="text-slate-500 mb-4">Vytvořte na základě obsahu lekce sérii podcastů nebo jiné doplňkové materiály.</p>
                ${await createDocumentSelector(lessonId)}
                <div class="bg-slate-50 p-4 rounded-lg">
                    <h4 class="font-bold text-slate-800 mb-3">🎙️ Generátor Podcastové Série</h4>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                            <label class="block font-medium text-slate-600 text-sm">Počet epizod</label>
                            <input id="episode-count-input" type="number" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="3">
                        </div>
                        <div>
                            <label class="block font-medium text-slate-600 text-sm">Hlas</label>
                            <select id="voice-select" class="w-full border-slate-300 rounded-lg p-2 mt-1"><option>Mužský (informativní)</option><option>Ženský (konverzační)</option></select>
                        </div>
                        <div>
                            <label class="block font-medium text-slate-600 text-sm">Jazyk</label>
                            <select class="w-full border-slate-300 rounded-lg p-2 mt-1"><option>Čeština</option><option>Angličtina</option></select>
                        </div>
                    </div>
                    <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-20" placeholder="Zadejte hlavní téma pro sérii podcastů. Standardně vychází z tématu lekce. Např. 'Vytvoř sérii podcastů, které detailněji prozkoumají klíčové koncepty kvantové fyziky zmíněné v lekci.'">${'Prozkoumej klíčové koncepty z lekce "' + (currentLesson?.title || 'aktuální lekce') + '"'}</textarea>
                    <div class="text-right mt-4">
                        <button id="generate-btn" data-type="podcast" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ml-auto ai-glow">✨<span class="ml-2">Vytvořit sérii podcastů</span></button>
                    </div>
                </div>
                 <div id="generation-output" class="mt-6 border-t pt-6">
                    <div class="text-center p-8 text-slate-400">Vygenerovaný obsah se zobrazí zde...</div>
                </div>
                <div class="text-right mt-4"><button id="save-content-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105 hidden">Uložit do lekce</button></div>
            `);
            break;
        default:
            contentHTML = renderWrapper(viewId, `<div class="text-center p-8 text-slate-400">Tato sekce se připravuje.</div>`);
    }
    container.innerHTML = contentHTML;

    // Attach event listeners after rendering
    attachEditorEventListeners(viewId);
}

function attachEditorEventListeners(viewId) {
    if (viewId === 'details') {
        document.getElementById('save-lesson-btn')?.addEventListener('click', handleSaveLesson);
    }
    if (viewId === 'docs') {
        setTimeout(() => initializeUpload(currentLesson), 0);
    }
    if (viewId === 'video') {
        const embedBtn = document.getElementById('embed-video-btn');
        embedBtn?.addEventListener('click', () => {
            const urlInput = document.getElementById('youtube-url');
            const url = urlInput.value;
            handleSaveGeneratedContent(currentLesson, 'videoUrl', url);
            const videoId = url.split('v=')[1]?.split('&')[0];
            const preview = document.getElementById('video-preview');
            if (videoId) {
                preview.innerHTML = `<div class="rounded-xl overflow-hidden aspect-video mx-auto max-w-2xl shadow-lg"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen class="w-full h-full"></iframe></div>`;
            } else {
                preview.innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg text-center">Neplatná YouTube URL.</div>`;
            }
        });
        // Show existing preview
        const existingUrl = document.getElementById('youtube-url').value;
        if (existingUrl) {
            const existingVideoId = existingUrl.split('v=')[1]?.split('&')[0];
            if (existingVideoId) document.getElementById('video-preview').innerHTML = `<div class="rounded-xl overflow-hidden aspect-video mx-auto max-w-2xl shadow-lg"><iframe src="https://www.youtube.com/embed/${existingVideoId}" frameborder="0" allowfullscreen class="w-full h-full"></iframe></div>`;
        }
    }

    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', () => handleGeneration(viewId));
    }

    const saveBtn = document.getElementById('save-content-btn');
    if(saveBtn && viewId === 'text') {
        saveBtn.addEventListener('click', () => {
             const outputEl = document.getElementById('generation-output');
             const contentToSave = outputEl.innerHTML;
             handleSaveGeneratedContent(currentLesson, 'content', contentToSave);
        });
    }
}


async function handleSaveLesson() {
    const saveBtn = document.getElementById('save-lesson-btn');
    const title = document.getElementById('lesson-title-input').value;
    const subtitle = document.getElementById('lesson-subtitle-input').value;
    const number = document.getElementById('lesson-number-input').value;
    const icon = document.getElementById('lesson-icon-input').value;

    if (!title) {
        showToast('Název lekce je povinný.', true);
        return;
    }

    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<div class="spinner"></div>`;

    const lessonData = { title, subtitle, number, icon };

    try {
        if (currentLesson && currentLesson.id) {
            const lessonRef = doc(db, 'lessons', currentLesson.id);
            await updateDoc(lessonRef, lessonData);
            Object.assign(currentLesson, lessonData); // Update local state
            showToast('Lekce byla úspěšně aktualizována.');
            document.getElementById('editor-lesson-title').textContent = title; // Update title in editor menu
        } else {
            const docRef = await addDoc(collection(db, 'lessons'), {
                ...lessonData,
                status: 'Naplánováno',
                creationDate: new Date().toISOString().split('T')[0],
                createdAt: serverTimestamp()
            });
            currentLesson = { id: docRef.id, ...lessonData };
            showToast('Lekce byla úspěšně vytvořena.');
            // Re-render the editor to get the correct context (e.g., for file uploads)
            const sidebar = document.getElementById('professor-sidebar');
            renderEditorMenu(sidebar, currentLesson);
            showEditorContent('details', currentLesson);
        }
    } catch (error) {
        console.error("Chyba při ukládání lekce: ", error);
        showToast("Při ukládání lekce došlo k chybě.", true);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}

async function handleGeneration(viewId) {
    const outputEl = document.getElementById('generation-output');
    const promptInput = document.getElementById('prompt-input');
    const generateBtn = document.getElementById('generate-btn');
    let userPrompt = promptInput ? promptInput.value.trim() : 'general prompt for ' + viewId;

    if (promptInput && !userPrompt) {
        outputEl.innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg">Prosím, zadejte text do promptu.</div>`;
        return;
    }

    const originalText = generateBtn.innerHTML;
    generateBtn.innerHTML = `<div class="spinner"></div><span class="ml-2">Generuji...</span>`;
    generateBtn.disabled = true;
    if (promptInput) promptInput.disabled = true;
    outputEl.innerHTML = `<div class="p-8 text-center pulse-loader text-slate-500">🤖 AI Sensei přemýšlí a tvoří obsah...</div>`;

    let result;
    let rawResultForSaving = null;

    try {
        const documentSelect = document.getElementById('document-select');
        const filePath = documentSelect && documentSelect.options.length > 0 ? documentSelect.value : null;

        if (filePath) {
            // RAG-based generation
            let finalPrompt = userPrompt;
            let isJson = ['presentation', 'quiz', 'test', 'post'].includes(viewId);
            // Construct schema-based prompt for RAG
            // This part is complex and needs to be carefully constructed based on viewId
            // For now, let's assume a simplified prompt construction
            finalPrompt = `Using the document provided, generate content for: ${userPrompt}`;

            const ragResult = await callGenerateFromDocument({ filePaths: [filePath], prompt: finalPrompt });
            if (ragResult.error) throw new Error(ragResult.error);
            rawResultForSaving = ragResult.text;
            result = isJson ? JSON.parse(ragResult.text) : ragResult;

        } else {
            // Standard generation without RAG
            switch(viewId) {
                case 'text':
                    const length = document.getElementById('length-select').value;
                    result = await callGeminiApi(`Vytvoř studijní text na základě tohoto zadání. Požadovaná délka je ${length}. Text by měl být poutavý a edukativní. Zadání: "${userPrompt}"`);
                    rawResultForSaving = result.text;
                    break;
                case 'presentation':
                    const slideCount = document.getElementById('slide-count-input').value;
                    result = await callGeminiForJson(`Vytvoř prezentaci na téma "${userPrompt}" s přesně ${slideCount} slidy.`, { type: "OBJECT", properties: { slides: { type: "ARRAY", items: { type: "OBJECT", properties: { title: { type: "STRING" }, points: { type: "ARRAY", items: { type: "STRING" } } }, required: ["title", "points"] } } } });
                    rawResultForSaving = result;
                    break;
                // Add cases for quiz, test, post
            }
        }

        if (result.error) throw new Error(result.error);
        renderGeneratedContent(viewId, result, outputEl);

        const saveBtn = document.getElementById('save-content-btn');
        if (saveBtn) {
            saveBtn.classList.remove('hidden');
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            newSaveBtn.addEventListener('click', () => {
                const fieldMapping = { 'presentation': 'presentationData', 'quiz': 'quizData', 'test': 'testData', 'post': 'postData' };
                handleSaveGeneratedContent(currentLesson, fieldMapping[viewId], rawResultForSaving);
            });
        }

    } catch (e) {
        outputEl.innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg">Došlo k chybě: ${e.message}</div>`;
    } finally {
        generateBtn.innerHTML = originalText;
        generateBtn.disabled = false;
        if (promptInput) promptInput.disabled = false;
    }
}

function renderGeneratedContent(viewId, result, outputEl) {
    switch(viewId) {
        case 'text':
            outputEl.innerHTML = `<div class="prose max-w-none">${result.text.replace(/\n/g, '<br>')}</div>`;
            break;
        case 'presentation':
            const slidesHtml = result.slides.map((slide, i) => `<div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm"><h4 class="font-bold text-green-700">Slide ${i+1}: ${slide.title}</h4><ul class="list-disc list-inside mt-2 text-sm text-slate-600">${slide.points.map(p => `<li>${p}</li>`).join('')}</ul></div>`).join('');
            outputEl.innerHTML = slidesHtml;
            break;
        // Add cases for quiz, test, post
    }
}


async function handleSaveGeneratedContent(lesson, fieldToUpdate, contentToSave) {
    const saveBtn = document.getElementById('save-content-btn');
    if (!lesson || !lesson.id) {
        showToast("Nelze uložit obsah, lekce nebyla uložena.", true);
        return;
    }

    const lessonRef = doc(db, 'lessons', lesson.id);
    const originalText = saveBtn ? saveBtn.innerHTML : 'Uložit';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<div class="spinner"></div>`;
    }

    try {
        await updateDoc(lessonRef, { [fieldToUpdate]: contentToSave });
        showToast("Obsah byl úspěšně uložen do lekce.");
        if (lesson) lesson[fieldToUpdate] = contentToSave;
        if (saveBtn) saveBtn.classList.add('hidden');
    } catch (error) {
        console.error(`Chyba při ukládání obsahu (${fieldToUpdate}) do lekce:`, error);
        showToast("Při ukládání obsahu došlo k chybě.", true);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    }
}