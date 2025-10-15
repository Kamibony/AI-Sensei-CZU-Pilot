import { doc, addDoc, updateDoc, collection, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, listAll } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, storage } from './firebase-init.js';
import { showToast } from './utils.js';
import { callGenerateContent } from './gemini-api.js';

let currentLesson = null;
const MAIN_COURSE_ID = "main-course"; 

async function createDocumentSelector() {
    const documentsRef = ref(storage, `courses/${MAIN_COURSE_ID}/media`);
    try {
        const res = await listAll(documentsRef);
        if (res.items.length === 0) {
            return `<div class="mb-4 p-3 bg-yellow-100 text-yellow-800 rounded-lg text-sm">Pro využití RAG prosím nahrajte nejprve nějaký dokument v sekci 'Knihovna médií'.</div>`;
        }
        const options = res.items.map(itemRef => `
            <label class="flex items-center space-x-3 p-2 rounded-lg hover:bg-slate-50">
                <input type="checkbox" class="document-checkbox h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500" value="${itemRef.fullPath}">
                <span>${itemRef.name}</span>
            </label>
        `).join('');
        return `
            <div class="mb-4">
                <label class="block font-medium text-slate-600 mb-2">Vyberte kontextové dokumenty (RAG):</label>
                <div class="space-y-2 border rounded-lg p-2 max-h-48 overflow-y-auto" id="document-selector-container">
                    ${options}
                </div>
            </div>`;
    } catch (error) {
        console.error("Chyba při načítání dokumentů pro selektor:", error);
        showToast("Nepodařilo se načíst dokumenty pro RAG.", true);
        return `<div class="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">Nepodařilo se načíst dokumenty.</div>`;
    }
}

function handleDownloadLessonContent() {
    if (!currentLesson) {
        showToast("Lekce není načtena, nelze stáhnout obsah.", true);
        return;
    }

    let contentString = "";
    const title = currentLesson.title || "Nová lekce";

    contentString += `# ${title}\n`;
    if (currentLesson.subtitle) {
        contentString += `## ${currentLesson.subtitle}\n`;
    }
    contentString += `\n---\n\n`;

    if (currentLesson.text_content) {
        contentString += `### Hlavní text pro studenty\n\n`;
        contentString += `${currentLesson.text_content}\n\n---\n\n`;
    }

    if (currentLesson.presentation && currentLesson.presentation.slides) {
        contentString += `### Prezentace\n\n`;
        currentLesson.presentation.slides.forEach((slide, index) => {
            contentString += `**Slide ${index + 1}: ${slide.title}**\n`;
            (slide.points || []).forEach(point => {
                contentString += `- ${point}\n`;
            });
            contentString += `\n`;
        });
        contentString += `---\n\n`;
    }

    if (currentLesson.quiz && currentLesson.quiz.questions) {
        contentString += `### Kvíz\n\n`;
        currentLesson.quiz.questions.forEach((q, index) => {
            contentString += `${index + 1}. ${q.question_text}\n`;
            (q.options || []).forEach((option, i) => {
                const isCorrect = i === q.correct_option_index ? " (Správně)" : "";
                contentString += `  - ${option}${isCorrect}\n`;
            });
            contentString += `\n`;
        });
        contentString += `---\n\n`;
    }

    if (currentLesson.test && currentLesson.test.questions) {
        contentString += `### Test\n\n`;
        currentLesson.test.questions.forEach((q, index) => {
            contentString += `${index + 1}. ${q.question_text}\n`;
            (q.options || []).forEach((option, i) => {
                const isCorrect = i === q.correct_option_index ? " (Správně)" : "";
                contentString += `  - ${option}${isCorrect}\n`;
            });
            contentString += `\n`;
        });
        contentString += `---\n\n`;
    }
    
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


export function renderEditorMenu(container, lesson) {
    currentLesson = lesson;
    container.innerHTML = `
        <header class="p-4 border-b border-slate-200 flex-shrink-0">
            <button id="back-to-timeline-btn" class="flex items-center text-sm text-green-700 hover:underline mb-3">&larr; Zpět na plán výuky</button>
            <div class="flex justify-between items-start">
                <div class="flex items-center space-x-3">
                    <span class="text-3xl">${currentLesson ? currentLesson.icon : '🆕'}</span>
                    <h2 id="editor-lesson-title" class="text-xl font-bold truncate text-slate-800">${currentLesson ? currentLesson.title : 'Vytvořit novou lekci'}</h2>
                </div>
                <button id="download-lesson-btn" title="Stáhnout obsah lekce" class="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                </button>
            </div>
        </header>
        <div class="flex-grow overflow-y-auto p-2"><nav id="editor-vertical-menu" class="flex flex-col space-y-1"></nav></div>`;

    container.querySelector('#back-to-timeline-btn').addEventListener('click', () => {
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
        { id: 'post', label: 'Podcast & Materiály', icon: '🎙️' },
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
    
    menuEl.querySelector('.editor-menu-item[data-view="details"]').click();
}

export async function showEditorContent(viewId, lesson) {
    currentLesson = lesson;
    const mainArea = document.getElementById('main-content-area');
    mainArea.innerHTML = `<div class="p-4 sm:p-6 md:p-8 overflow-y-auto h-full view-transition" id="editor-content-container"></div>`;
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
        let renderedContent = '<div class="text-center p-8 text-slate-400">Pro tuto sekci zatím není uložen žádný obsah.</div>';
        if(currentLesson && currentLesson[field]) {
            renderedContent = renderFn(currentLesson[field]);
        }
        return renderWrapper(title, renderedContent, deleteButton);
    };

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
            if (currentLesson?.text_content) {
                contentHTML = renderSavedContent('Text pro studenty', 'text_content', (data) => `<div class="prose max-w-none">${data.replace(/\n/g, '<br>')}</div>`);
            } else {
                contentHTML = renderWrapper('Text pro studenty', `
                    <p class="text-slate-500 mb-4">Zadejte AI prompt a vygenerujte hlavní studijní text pro tuto lekci. Můžete vybrat dokumenty, ze kterých bude AI čerpat informace (RAG).</p>
                    ${await createDocumentSelector()}
                    <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder="Např. 'Vytvoř poutavý úvodní text o principech kvantové mechaniky pro úplné začátečníky.'"></textarea>
                    <div class="flex items-center justify-between mt-4">
                        <div class="flex items-center space-x-4">
                            <label class="font-medium">Délka:</label>
                            <select id="length-select" class="rounded-lg border-slate-300"><option>Krátký</option><option selected>Střední</option><option>Dlouhý</option></select>
                        </div>
                        <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ai-glow">✨<span class="ml-2">Generovat text</span></button>
                    </div>
                    <div id="generation-output" class="mt-6 border-t pt-6 text-slate-700 prose max-w-none">
                         <div class="text-center p-8 text-slate-400">Obsah se vygeneruje zde...</div>
                    </div>
                    <div class="text-right mt-4"><button id="save-content-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105 hidden">Uložit do lekce</button></div>
                    `);
            }
            break;
        case 'presentation':
             if (currentLesson?.presentation) {
                contentHTML = renderSavedContent('AI Prezentace', 'presentation', (data) => renderGeneratedContent('presentation', data));
             } else {
                contentHTML = renderWrapper('AI Prezentace', `
                    <p class="text-slate-500 mb-4">Zadejte téma a počet slidů pro vygenerování prezentace. Můžete vybrat dokumenty, ze kterých bude AI čerpat informace (RAG).</p>
                    ${await createDocumentSelector()}
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="md:col-span-2"><label class="block font-medium text-slate-600">Téma prezentace</label><input id="prompt-input" type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1" placeholder="Např. Klíčové momenty Římské republiky"></div>
                        <div><label class="block font-medium text-slate-600">Počet slidů</label><input id="slide-count-input" type="number" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="5"></div>
                    </div>
                    <div class="text-right mt-4">
                         <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ml-auto ai-glow">✨<span class="ml-2">Generovat prezentaci</span></button>
                    </div>
                    <div id="generation-output" class="mt-6 border-t pt-6">
                        <div class="text-center p-8 text-slate-400">Náhled prezentace se zobrazí zde...</div>
                    </div>
                    <div class="text-right mt-4"><button id="save-content-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105 hidden">Uložit do lekce</button></div>
                    `);
             }
            break;
        case 'video':
            contentHTML = renderWrapper('Vložení videa', `
                <p class="text-slate-500 mb-4">Vložte odkaz na video z YouTube, které se zobrazí studentům v jejich panelu.</p>
                <div><label class="block font-medium text-slate-600">YouTube URL</label><input id="youtube-url" type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="${currentLesson?.videoUrl || ''}" placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ"></div>
                <div class="text-right pt-4"><button id="embed-video-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800">Vložit video</button></div>
                <div id="video-preview" class="mt-6 border-t pt-6">
                    ${currentLesson?.videoUrl ? '' : '<div class="text-center p-8 text-slate-400">Náhled videa se zobrazí zde...</div>'}
                </div>`);
            break;
        case 'quiz':
            if (currentLesson?.quiz) {
                contentHTML = renderSavedContent('Interaktivní Kvíz', 'quiz', (data) => renderGeneratedContent('quiz', data));
            } else {
                contentHTML = renderWrapper('Interaktivní Kvíz', `
                    <p class="text-slate-500 mb-4">Vytvořte rychlý kvíz pro studenty. Můžete vybrat dokumenty, ze kterých bude AI čerpat informace (RAG).</p>
                    ${await createDocumentSelector()}
                    <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder="Např. 'Vytvoř 3 otázky s výběrem ze 4 možností na téma kvantová mechanika. U každé uveď správnou odpověď.'"></textarea>
                    <div class="text-right mt-4">
                         <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ml-auto ai-glow">✨<span class="ml-2">Vygenerovat kvíz</span></button>
                    </div>
                    <div id="generation-output" class="mt-6 border-t pt-6">
                        <div class="text-center p-8 text-slate-400">Náhled kvízu se zobrazí zde...</div>
                    </div>
                    <div class="text-right mt-4"><button id="save-content-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105 hidden">Uložit do lekce</button></div>
                    `);
            }
            break;
        case 'test':
             if (currentLesson?.test) {
                contentHTML = renderSavedContent('Pokročilý Test', 'test', (data) => renderGeneratedContent('test', data));
             } else {
                contentHTML = renderWrapper('Pokročilý Test', `
                    <p class="text-slate-500 mb-4">Navrhněte komplexnější test pro studenty. Můžete vybrat dokumenty, ze kterých bude AI čerpat informace (RAG).</p>
                    ${await createDocumentSelector()}
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div><label class="block font-medium text-slate-600">Počet otázek</label><input id="question-count-input" type="number" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="5"></div>
                        <div>
                            <label class="block font-medium text-slate-600">Obtížnost</label>
                            <select id="difficulty-select" class="w-full border-slate-300 rounded-lg p-2 mt-1"><option>Lehká</option><option selected>Střední</option><option>Těžká</option></select>
                        </div>
                        <div>
                            <label class="block font-medium text-slate-600">Typy otázek</label>
                            <select id="type-select" class="w-full border-slate-300 rounded-lg p-2 mt-1"><option>Mix (výběr + pravda/nepravda)</option><option>Výběr z možností</option><option>Pravda/Nepravda</option></select>
                        </div>
                    </div>
                    <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder="Zadejte hlavní téma testu, např. 'Klíčové události a postavy Římské republiky'"></textarea>
                    <div class="text-right mt-4">
                         <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ml-auto ai-glow">✨<span class="ml-2">Vygenerovat test</span></button>
                    </div>
                    <div id="generation-output" class="mt-6 border-t pt-6">
                        <div class="text-center p-8 text-slate-400">Náhled testu se zobrazí zde...</div>
                    </div>
                    <div class="text-right mt-4"><button id="save-content-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105 hidden">Uložit do lekce</button></div>
                    `);
             }
            break;
        case 'post':
            if (currentLesson?.podcast_script) {
                contentHTML = renderSavedContent('Podcast & Doplňkové materiály', 'podcast_script', (data) => renderGeneratedContent('post', data));
            } else {
                contentHTML = renderWrapper('Podcast & Doplňkové materiály', `
                    <p class="text-slate-500 mb-4">Vytvořte na základě obsahu lekce sérii podcastů nebo jiné doplňkové materiály.</p>
                    ${await createDocumentSelector()}
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
                        <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-20" placeholder="Zadejte hlavní téma pro sérii podcastů...">${'Prozkoumej klíčové koncepty z lekce "' + (currentLesson?.title || 'aktuální lekce') + '"'}</textarea>
                        <div class="text-right mt-4">
                            <button id="generate-btn" data-type="podcast" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ml-auto ai-glow">✨<span class="ml-2">Vytvořit sérii podcastů</span></button>
                        </div>
                    </div>
                     <div id="generation-output" class="mt-6 border-t pt-6">
                        <div class="text-center p-8 text-slate-400">Vygenerovaný obsah se zobrazí zde...</div>
                    </div>
                    <div class="text-right mt-4"><button id="save-content-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105 hidden">Uložit do lekce</button></div>
                `);
            }
            break;
        default:
            contentHTML = renderWrapper(viewId, `<div class="text-center p-8 text-slate-400">Tato sekce se připravuje.</div>`);
    }

    container.innerHTML = contentHTML;
    attachEditorEventListeners(viewId);
}

function attachEditorEventListeners(viewId) {
    document.getElementById('save-lesson-btn')?.addEventListener('click', handleSaveLesson);
    
    const deleteBtn = document.getElementById('delete-content-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            const field = deleteBtn.dataset.field;
            handleDeleteGeneratedContent(field, viewId);
        });
    }

    if (viewId === 'video') {
        const embedBtn = document.getElementById('embed-video-btn');
        const urlInput = document.getElementById('youtube-url');
        const preview = document.getElementById('video-preview');

        const showPreview = (url) => {
            if (!url) {
                preview.innerHTML = '<div class="text-center p-8 text-slate-400">Náhled videa se zobrazí zde...</div>';
                return false;
            }
            const videoIdMatch = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            const videoId = videoIdMatch ? videoIdMatch[1] : null;

            if (videoId) {
                preview.innerHTML = `<div class="rounded-xl overflow-hidden aspect-video mx-auto max-w-2xl shadow-lg"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen class="w-full h-full"></iframe></div>`;
                return true;
            } else {
                if (url.trim() !== '') {
                    preview.innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg text-center">Neplatná YouTube URL.</div>`;
                }
                return false;
            }
        };

        embedBtn?.addEventListener('click', async () => {
            const url = urlInput.value;
            if (showPreview(url)) {
                await handleSaveGeneratedContent('videoUrl', url);
            } else if (url.trim() === '') {
                await handleDeleteGeneratedContent('videoUrl', viewId);
            }
        });
        
        if (currentLesson?.videoUrl) {
            showPreview(currentLesson.videoUrl);
        }
    }

    const generateBtn = document.getElementById('generate-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', () => handleGeneration(viewId));
    }

    const saveBtn = document.getElementById('save-content-btn');
    if(saveBtn) {
        saveBtn.addEventListener('click', () => {
             handleSaveGeneratedContent(saveBtn.dataset.field, window.rawResultForSaving);
        });
    }
}

async function handleSaveLesson() {
    const title = document.getElementById('lesson-title-input').value.trim();
    if (!title) {
        showToast("Název lekce nemůže být prázdný.", true);
        return;
    }

    const lessonData = {
        title: title,
        subtitle: document.getElementById('lesson-subtitle-input').value,
        number: document.getElementById('lesson-number-input').value,
        icon: document.getElementById('lesson-icon-input').value || '🆕',
    };

    const saveBtn = document.getElementById('save-lesson-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<div class="spinner"></div>`;

    try {
        if (currentLesson && currentLesson.id) {
            await updateDoc(doc(db, 'lessons', currentLesson.id), lessonData);
            currentLesson = { ...currentLesson, ...lessonData }; 
            showToast("Lekce byla úspěšně aktualizována.");
        } else {
            const docRef = await addDoc(collection(db, 'lessons'), { ...lessonData, createdAt: serverTimestamp() });
            currentLesson = { id: docRef.id, ...lessonData };
            showToast("Nová lekce byla úspěšně vytvořena.");
            document.getElementById('editor-lesson-title').textContent = lessonData.title;
        }
    } catch (error) {
        console.error("Error saving lesson:", error);
        showToast("Při ukládání lekce došlo k chybě.", true);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Uložit změny';
    }
}


async function handleGeneration(viewId) {
    const outputEl = document.getElementById('generation-output');
    const promptInput = document.getElementById('prompt-input');
    const generateBtn = document.getElementById('generate-btn');
    const userPrompt = promptInput ? promptInput.value.trim() : '';

    if (promptInput && !userPrompt && viewId !== 'details') {
        outputEl.innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg">Prosím, zadejte text do promptu.</div>`;
        return;
    }

    const originalText = generateBtn.innerHTML;
    generateBtn.innerHTML = `<div class="spinner"></div><span class="ml-2">Generuji...</span>`;
    generateBtn.disabled = true;
    if (promptInput) promptInput.disabled = true;
    outputEl.innerHTML = `<div class="p-8 text-center pulse-loader text-slate-500">🤖 AI Sensei přemýšlí a tvoří obsah...</div>`;

    window.rawResultForSaving = null;

    try {
        const checkedBoxes = document.querySelectorAll('.document-checkbox:checked');
        const filePaths = Array.from(checkedBoxes).map(cb => cb.value);

        const promptData = {
            userPrompt,
            slideCount: document.getElementById('slide-count-input')?.value,
            questionCount: document.getElementById('question-count-input')?.value,
            difficulty: document.getElementById('difficulty-select')?.value,
            questionTypes: document.getElementById('type-select')?.value,
            episodeCount: document.getElementById('episode-count-input')?.value,
            length: document.getElementById('length-select')?.value,
        };

        const result = await callGenerateContent({
            contentType: viewId,
            promptData,
            filePaths,
        });
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        window.rawResultForSaving = (viewId === 'text' && result.text) ? result.text : result;
        
        outputEl.innerHTML = renderGeneratedContent(viewId, result);

        const saveBtn = document.getElementById('save-content-btn');
        if (saveBtn) {
            // --- ZAČIATOK KĽÚČOVEJ ÚPRAVY: Zjednotenie názvov ---
            const fieldMapping = { 
                'text': 'text_content', 
                'presentation': 'presentation', 
                'quiz': 'quiz', 
                'test': 'test', 
                'post': 'podcast_script' 
            };
            // --- KONIEC KĽÚČOVEJ ÚPRAVY ---
            saveBtn.dataset.field = fieldMapping[viewId];
            saveBtn.classList.remove('hidden');
        }

    } catch (e) {
        outputEl.innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg">Došlo k chybě: ${e.message}</div>`;
    } finally {
        generateBtn.innerHTML = originalText;
        generateBtn.disabled = false;
        if (promptInput) promptInput.disabled = false;
    }
}


function renderGeneratedContent(viewId, result) {
    if (!result) {
        return `<div class="p-4 bg-red-100 text-red-700 rounded-lg">Došlo k chybě: AI vrátila prázdnou odpověď.</div>`;
    }

    try {
        switch(viewId) {
            case 'text':
                if (typeof result.text !== 'string') throw new Error("Odpověď neobsahuje platný text.");
                return `<div class="prose max-w-none">${result.text.replace(/\n/g, '<br>')}</div>`;
            case 'presentation':
                return result.slides.map((slide, i) => `<div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm"><h4 class="font-bold text-green-700">Slide ${i+1}: ${slide.title}</h4><ul class="list-disc list-inside mt-2 text-sm text-slate-600">${slide.points.map(p => `<li>${p}</li>`).join('')}</ul></div>`).join('');
            case 'quiz':
            case 'test':
                return result.questions.map((q, i) => {
                    const optionsHtml = q.options.map((opt, j) => `<div class="text-sm p-2 rounded-lg ${j === q.correct_option_index ? 'bg-green-100 font-semibold' : 'bg-slate-50'}">${opt}</div>`).join('');
                    return `<div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm">
                                <h4 class="font-bold text-green-700">Otázka ${i+1}: ${q.question_text}</h4>
                                <div class="mt-2 space-y-2">${optionsHtml}</div>
                            </div>`;
                }).join('');
            case 'post':
                return result.episodes.map((episode, i) => `<div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm"><h4 class="font-bold text-green-700">Epizoda ${i+1}: ${episode.title}</h4><p class="mt-2 text-sm text-slate-600">${episode.script.replace(/\n/g, '<br>')}</p></div>`).join('');
            default:
                return `<div class="p-4 bg-yellow-100 text-yellow-700 rounded-lg">Neznámý typ obsahu pro zobrazení.</div>`;
        }
    } catch(e) {
        console.error("Error rendering content:", e);
        console.error("Received AI result that caused the error:", result);
        return `<div class="p-4 bg-red-100 text-red-700 rounded-lg">Došlo k chybě při zobrazování odpovědi od AI: ${e.message}</div>`;
    }
}

async function handleSaveGeneratedContent(fieldToUpdate, contentToSave) {
    const saveBtn = document.getElementById('save-content-btn');
    
    if (!currentLesson || !currentLesson.id) {
        await handleSaveLesson();
        if (!currentLesson || !currentLesson.id) {
            showToast("Nejprve uložte detaily lekce.", true);
            return;
        }
    }

    if (!contentToSave) {
        showToast("Není co uložit. Vygenerujte prosím nejprve obsah.", true);
        return;
    }

    const lessonRef = doc(db, 'lessons', currentLesson.id);
    const originalText = saveBtn ? saveBtn.innerHTML : 'Uložit';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<div class="spinner"></div>`;
    }

    try {
        let dataToSave = contentToSave;
        if (fieldToUpdate === 'text_content' && typeof dataToSave === 'object' && dataToSave.text) {
             dataToSave = dataToSave.text;
        }
        if(typeof dataToSave === 'string') {
             dataToSave = dataToSave.replace(/<br\s*[\/]?>/gi, '\n');
        }

        await updateDoc(lessonRef, { [fieldToUpdate]: dataToSave });

        showToast("Obsah byl úspěšně uložen do lekce.");
        if (currentLesson) currentLesson[fieldToUpdate] = dataToSave;
        
        const currentViewId = document.querySelector('.editor-menu-item.bg-green-100').dataset.view;
        showEditorContent(currentViewId, currentLesson);

    } catch (error) {
        console.error(`Chyba při ukládání obsahu (${fieldToUpdate}) do lekce:`, error);
        showToast("Při ukládání obsahu došlo k chybě.", true);
    }
}

async function handleDeleteGeneratedContent(fieldToDelete, viewId) {
    if (!currentLesson || !currentLesson.id) {
        showToast("Lekce není uložena, nelze mazat obsah.", true);
        return;
    }
    if (!confirm("Opravdu si přejete smazat tento obsah a vytvořit nový?")) {
        return;
    }

    const deleteBtn = document.getElementById('delete-content-btn');
    const originalText = deleteBtn.innerHTML;
    deleteBtn.disabled = true;
    deleteBtn.innerHTML = `<div class="spinner-dark"></div> Mazání...`;

    try {
        const lessonRef = doc(db, 'lessons', currentLesson.id);
        await updateDoc(lessonRef, {
            [fieldToDelete]: deleteField()
        });
        
        delete currentLesson[fieldToDelete];
        
        showToast("Obsah byl úspěšně smazán.");
        
        showEditorContent(viewId, currentLesson);

    } catch (error) {
        console.error("Chyba při mazání obsahu:", error);
        showToast("Při mazání obsahu došlo k chybě.", true);
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = originalText;
    }
}
