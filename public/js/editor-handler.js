// Súbor: public/js/editor-handler.js
// OPRAVA 2: Opravené VŠETKY importy a volania z upload-handler.js

import { doc, addDoc, updateDoc, collection, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, functions } from './firebase-init.js'; 
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { showToast } from './utils.js'; 
import { openMediaUploaderModal, loadMediaLibrary } from './upload-handler.js'; // <-- OPRAVENÉ

let editorInstance = null;
let currentLessonData = null; // Bude uchovávat aktuální data lekce
let isLessonDirty = false; // Sleduje, zda byly provedeny změny

// --- NOVÁ GLOBÁLNA PREMENNÁ MODULU ---
let currentProfessorId = null;
// -------------------------------------


/**
 * Vykreslí menu editoru lekce do sidebaru.
 * @param {HTMLElement} sidebar - Kontejner sidebaru.
 * @param {object | null} lesson - Objekt lekce k editaci, nebo null pro novou lekci.
 * @param {string} professorId - ID přihlášeného profesora.
 */
export function renderEditorMenu(sidebar, lesson, professorId) { 

    currentProfessorId = professorId;
    if (!currentProfessorId) {
        console.error("renderEditorMenu: professorId není nastaveno!");
        showToast("Kritická chyba: Nelze identifikovat profesora v editoru.", true);
    }

    const isNewLesson = lesson === null;

    if (isNewLesson) {
        currentLessonData = {
            id: `new-${Date.now()}`,
            title: "Nová lekce",
            subtitle: "",
            description: "",
            content: "<p>Zde začněte psát nebo vygenerujte text pomocí AI.</p>",
            isPublished: false,
            videos: [],
            quizzes: [],
            tests: [],
            podcasts: []
        };
    } else {
        currentLessonData = {
            ...lesson,
            videos: lesson.videos || [],
            quizzes: lesson.quizzes || [],
            tests: lesson.tests || [],
            podcasts: lesson.podcasts || []
        };
    }

    isLessonDirty = false; 

    sidebar.innerHTML = `
        <header class="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 class="text-xl font-bold text-slate-800">${isNewLesson ? 'Tvorba nové lekce' : 'Editor lekce'}</h2>
            <button id="close-editor-btn" title="Zavřít editor" class="p-1 rounded-full text-slate-400 hover:bg-slate-200">&times;</button>
        </header>
        <div class="flex-grow overflow-y-auto p-4 space-y-4">
            <div>
                <label for="lesson-title" class="block text-sm font-medium text-slate-600 mb-1">Název lekce</label>
                <input type="text" id="lesson-title" value="${currentLessonData.title}" class="w-full p-2 border border-slate-300 rounded-lg">
            </div>
            <div>
                <label for="lesson-subtitle" class="block text-sm font-medium text-slate-600 mb-1">Podtitulek</label>
                <input type="text" id="lesson-subtitle" value="${currentLessonData.subtitle || ''}" class="w-full p-2 border border-slate-300 rounded-lg">
            </div>
            <div>
                <label for="lesson-description" class="block text-sm font-medium text-slate-600 mb-1">Popis (pro AI)</label>
                <textarea id="lesson-description" rows="3" class="w-full p-2 border border-slate-300 rounded-lg" placeholder="Kontext pro generování textu">${currentLessonData.description || ''}</textarea>
            </div>

            <div class="flex items-center justify-between p-3 bg-slate-100 rounded-lg">
                <label for="lesson-published" class="text-sm font-medium text-slate-700">Publikováno</label>
                <div class="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                    <input type="checkbox" name="lesson-published" id="lesson-published" class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer" ${currentLessonData.isPublished ? 'checked' : ''}/>
                    <label for="lesson-published" class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
                </div>
            </div>

        </div>
        <footer class="p-4 border-t border-slate-200 space-y-2 flex-shrink-0">
            <button id="save-lesson-btn" class="w-full p-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800">
                ${isNewLesson ? 'Vytvořit a uložit' : 'Uložit změny'}
            </button>
            <button id="generate-text-btn" class="w-full p-3 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 ${isNewLesson ? 'hidden' : ''}">
                Vygenerovat/Upravit text (AI)
            </button>
            <button id="delete-lesson-btn" class="w-full p-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 ${isNewLesson ? 'hidden' : ''}">
                Smazat lekci
            </button>
        </footer>
    `;

    // Zobrazí obsah editoru v hlavní oblasti
    showEditorContent(currentLessonData.content);

    // Nastavení listenerů pro metadata
    document.getElementById('lesson-title').addEventListener('input', (e) => {
        currentLessonData.title = e.target.value;
        isLessonDirty = true;
    });
    document.getElementById('lesson-subtitle').addEventListener('input', (e) => {
        currentLessonData.subtitle = e.target.value;
        isLessonDirty = true;
    });
    document.getElementById('lesson-description').addEventListener('input', (e) => {
        currentLessonData.description = e.target.value;
        isLessonDirty = true;
    });
     document.getElementById('lesson-published').addEventListener('change', (e) => {
        handlePublishLesson(currentLessonData.id, e.target.checked);
    });

    // Nastavení listenerů pro tlačítka
    document.getElementById('save-lesson-btn').addEventListener('click', () => handleSaveLesson(isNewLesson));

    const generateBtn = document.getElementById('generate-text-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', () => handleGenerateText(currentLessonData.id, editorInstance));
    }

    const deleteBtn = document.getElementById('delete-lesson-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => handleDeleteLesson(currentLessonData.id));
    }

    document.getElementById('close-editor-btn').addEventListener('click', () => {
        // TODO: Místo reloadu raději přepnout view
        window.location.reload();
    });

    // Pôvodné volanie `initializeModalMediaUpload` (riadok 186) bolo odstránené.
    // Táto logika sa teraz deje priamo v `setup` TinyMCE.
}


/**
 * Zobrazí TinyMCE editor v hlavní oblasti.
 * @param {string} initialContent - HTML obsah k zobrazení v editoru.
 */
function showEditorContent(initialContent) {
    const mainArea = document.getElementById('main-content-area');
    mainArea.innerHTML = `
        <div class="w-full max-w-4xl mx-auto p-4 md:p-8 h-full flex flex-col" data-lesson-id="${currentLessonData.id}">
            <div id="editor-toolbar" class="sticky top-0 bg-slate-50 z-10 py-2 border-b border-slate-200 -mx-4 -mt-4 px-4 md:-mx-8 md:px-8">
                </div>

            <div id="lesson-editor-container" class="flex-grow mt-4 overflow-y-auto">
                <textarea id="lesson-editor">${initialContent}</textarea>
            </div>
        </div>
    `;

    // Inicializace TinyMCE
    if (tinymce.get('lesson-editor')) {
        tinymce.remove('#lesson-editor');
    }

    tinymce.init({
        selector: '#lesson-editor',
        plugins: 'autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table help wordcount autoresize quickbars',
        // Quickbars pro vkládání obsahu
        quickbars_insert_toolbar: 'customVideo quicktable | customQuiz customTest customPodcast',
        quickbars_selection_toolbar: 'bold italic underline | blocks | quicklink blockquote',

        toolbar: 'undo redo | blocks | bold italic underline | ' +
                 'alignleft aligncenter alignright | bullist numlist | ' +
                 'link customMediaButton | code | removeformat | help',

        menubar: false,
        statusbar: false,
        inline: false,
        content_style: 'body { font-family: Inter, sans-serif; font-size: 16px; line-height: 1.6; } .content-placeholder { color: #888; font-style: italic; }',
        autoresize_bottom_margin: 30,
        min_height: 500,

        setup: (editor) => {
            editorInstance = editor; // Uložíme instanci

            // Změna se projeví v isLessonDirty
            editor.on('dirty', () => {
                isLessonDirty = true;
            });

            // Vlastní tlačítko pro Média (z knihovny)
            editor.ui.registry.addButton('customMediaButton', {
                text: 'Média',
                icon: 'image',
                onAction: () => {
                    // Argumenty pre callback: (onMediaSelected, currentlyAttachedMedia)
                    // TODO: Načítať 'currentlyAttachedMedia' z 'currentLessonData'
                    openMediaUploaderModal((selectedMedia) => {
                         // Callback funkcia, ktorá sa vykoná po výbere
                        if (editorInstance) {
                            let content = '';
                            selectedMedia.forEach(mediaData => {
                                // Tu potrebujeme získať verejnú URL, čo je komplexné
                                // Zatiaľ vložíme placeholder
                                 content += `<p>[Vložené médium: ${mediaData.fileName}]</p>`;
                            });
                            editor.insertContent(content);
                            isLessonDirty = true; 
                        }
                    }, []); // Posielame prázdne pole ako 'currentlyAttached'

                }
            });

            // Vlastní tlačítko pro Video (přímé vložení URL)
            editor.ui.registry.addButton('customVideo', {
                icon: 'embed',
                tooltip: 'Vložit video (YouTube, Vimeo)',
                onAction: () => openVideoDialog(editor)
            });

            // Vlastní tlačítko pro Kvíz
            editor.ui.registry.addButton('customQuiz', {
                icon: 'checklist',
                tooltip: 'Vložit kvíz',
                onAction: () => openQuizDialog(editor)
            });

            // Vlastní tlačítko pro Test
            editor.ui.registry.addButton('customTest', {
                icon: 'file-check', // Nahrazeno ikonou
                tooltip: 'Vložit test',
                onAction: () => openTestDialog(editor)
            });

            // Vlastní tlačítko pro Podcast
            editor.ui.registry.addButton('customPodcast', {
                icon: 'volume',
                tooltip: 'Vložit podcast (Spotify)',
                onAction: () => openPodcastDialog(editor)
            });

            // Dvojklik pro editaci
            editor.on('dblclick', (e) => {
                const element = e.target;
                handleElementEdit(editor, element);
            });
        }
    });
}

/**
 * Zpracuje dvojklik na element a otevře příslušný dialog.
 * @param {object} editor - Instance TinyMCE editoru.
 * @param {HTMLElement} element - Element, na který bylo kliknuto.
 */
function handleElementEdit(editor, element) {
    const videoNode = element.closest('.video-placeholder');
    if (videoNode) {
        const videoId = videoNode.dataset.id;
        const videoData = currentLessonData.videos.find(v => v.id === videoId);
        if (videoData) {
            openVideoDialog(editor, videoData);
        }
        return;
    }

    const quizNode = element.closest('.quiz-placeholder');
    if (quizNode) {
        const quizId = quizNode.dataset.id;
        const quizData = currentLessonData.quizzes.find(q => q.id === quizId);
        if (quizData) {
            openQuizDialog(editor, quizData);
        }
        return;
    }

    const testNode = element.closest('.test-placeholder');
    if (testNode) {
        const testId = testNode.dataset.id;
        const testData = currentLessonData.tests.find(t => t.id === testId);
        if (testData) {
            openTestDialog(editor, testData);
        }
        return;
    }

    const podcastNode = element.closest('.podcast-placeholder');
    if (podcastNode) {
        const podcastId = podcastNode.dataset.id;
        const podcastData = currentLessonData.podcasts.find(p => p.id === podcastId);
        if (podcastData) {
            openPodcastDialog(editor, podcastData);
        }
    }
}


/**
 * Uloží změny v editoru (nová nebo existující lekce).
 * @param {boolean} isNew - Zda se jedná o novou lekci.
 */
async function handleSaveLesson(isNew) {
    if (!currentProfessorId) { // <-- ZMENA 4: Kontrola
        showToast("Kritická chyba: Nelze uložit. Chybí ID profesora.", true);
        return;
    }

    const title = document.getElementById('lesson-title').value;
    if (!title) {
        showToast("Název lekce je povinný.", true);
        return;
    }

    // Aktualizujeme data z editoru POUZE pokud se změnila
    if (editorInstance && isLessonDirty) {
        currentLessonData.content = editorInstance.getContent();
    }

    // Ostatní metadata už jsou v currentLessonData (z listenerů)

    const lessonDataToSave = {
        ...currentLessonData,
        updatedAt: serverTimestamp()
    };

    // Odebereme dočasné ID, pokud existuje
    if (isNew) {
        delete lessonDataToSave.id;
    }

    const saveBtn = document.getElementById('save-lesson-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<div class="spinner-small"></div>';

    try {
        if (isNew) {
            lessonDataToSave.createdAt = serverTimestamp();
            lessonDataToSave.timelinePosition = null;

            // --- ZMENA 5: Ukladanie do subkolekcie ---
            const docRef = await addDoc(collection(db, 'professors', currentProfessorId, 'lessons'), lessonDataToSave);
            // -----------------------------------------

            currentLessonData.id = docRef.id; // Aktualizujeme ID z dočasného na reálné
            document.querySelector(`[data-lesson-id]`).dataset.lessonId = currentLessonData.id;
            document.getElementById('generate-text-btn').classList.remove('hidden');
            document.getElementById('delete-lesson-btn').classList.remove('hidden');
            saveBtn.innerHTML = 'Uložit změny';
            showToast("Lekce byla úspěšně vytvořena.", false);
            isLessonDirty = false;

            // TODO: Měli bychom překreslit sidebar, aby se lekce objevila v knihovně

        } else {
            // --- ZMENA 6: Update v subkolekcii ---
            const lessonRef = doc(db, 'professors', currentProfessorId, 'lessons', currentLessonData.id);
            await updateDoc(lessonRef, lessonDataToSave);
            // ------------------------------------

            saveBtn.innerHTML = 'Uložit změny';
            showToast("Lekce byla aktualizována.", false);
            isLessonDirty = false;
        }
    } catch (error) {
        console.error("Error saving lesson:", error);
        showToast("Chyba při ukládání lekce.", true);
        saveBtn.innerHTML = isNew ? 'Vytvořit a uložit' : 'Uložit změny';
    } finally {
        saveBtn.disabled = false;
    }
}

/**
 * Zavolá backendovou funkci pro generování textu lekce.
 * @param {string} lessonId - ID lekce.
 * @param {object} editor - Instance TinyMCE editoru.
 */
async function handleGenerateText(lessonId, editor) {
    if (isNewLesson(lessonId)) {
        showToast("Nejprve lekci uložte, poté můžete generovat text.", true);
        return;
    }

    const title = document.getElementById('lesson-title').value;
    const description = document.getElementById('lesson-description').value;

    if (!title || !description) {
        showToast("Pro generování textu vyplňte název i popis lekce.", true);
        return;
    }

    const generateBtn = document.getElementById('generate-text-btn');
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<div class="spinner-small"></div> Generuji...';

    try {
        // --- ZMENA 9: Používame 'generateContent' ---
        const generateContent = httpsCallable(functions, 'generateContent');
        const result = await generateContent({
            lessonId: lessonId,
            prompt: description // Posíláme popis jako hlavní prompt
            // title se může použít v promptu uvnitř CF
            // professorId se posílá automaticky v kontextu
        });
        // ------------------------------------------

        // --- ZMENA 10: Očakávaný formát odpovede z 'generateContent' ---
        if (result.data.status === 'success' && result.data.content.text) {
             editor.setContent(result.data.content.text);
             showToast("Text lekce byl úspěšně vygenerován.", false);
             isLessonDirty = true; // Označíme, že je potřeba uložit
             // Automatické uložení po generování
             // await handleSaveLesson(false); // Odkomentujte, pokud chcete automaticky uložit
        } else {
             throw new Error(result.data.message || "Nepodařilo se získat text z AI.");
        }
        // -----------------------------------------------------------

    } catch (error) {
        console.error("Error generating lesson text:", error);
        showToast(`Chyba při generování: ${error.message}`, true);
    } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = 'Vygenerovat/Upravit text (AI)';
    }
}

/**
 * Smaže lekci z databáze.
 * @param {string} lessonId - ID lekce.
 */
async function handleDeleteLesson(lessonId) {
    if (isNewLesson(lessonId)) return; // Nelze smazat neuloženou

    if (!confirm(`Opravdu chcete trvale smazat lekci "${currentLessonData.title}"? Tato akce je nevratná.`)) {
        return;
    }

    try {
        // --- ZMENA 7: Mazanie zo subkolekcie ---
        if (!currentProfessorId) {
             throw new Error("Chybí ID profesora.");
        }
        await deleteDoc(doc(db, 'professors', currentProfessorId, 'lessons', lessonId));
        // -------------------------------------

        showToast("Lekce byla smazána.", false);
        // Po smazání by se měl uživatel vrátit na timeline
        window.location.reload(); // TODO: Nahradit přepnutím view

    } catch (error) {
        console.error("Error deleting lesson:", error);
        showToast(`Chyba při mazání lekce: ${error.message}`, true);
    }
}

/**
 * Aktualizuje stav publikace lekce.
 * @param {string} lessonId - ID lekce.
 * @param {boolean} isPublished - Nový stav publikace.
 */
async function handlePublishLesson(lessonId, isPublished) {
    currentLessonData.isPublished = isPublished;
    isLessonDirty = true;

    // Pokud je lekce nová, uloží se to při prvním uložení.
    if (isNewLesson(lessonId)) {
        showToast(`Stav publikace bude uložen spolu s lekcí.`, false);
        return;
    }

    // Pokud lekce existuje, uložíme změnu hned
    try {
        // --- ZMENA 8: Update v subkolekcii ---
        if (!currentProfessorId) {
             throw new Error("Chybí ID profesora.");
        }
        const lessonRef = doc(db, 'professors', currentProfessorId, 'lessons', lessonId);
        await updateDoc(lessonRef, {
            isPublished: isPublished,
            updatedAt: serverTimestamp()
        });
        // ------------------------------------

        showToast(isPublished ? "Lekce publikována." : "Lekce stažena z publikace.", false);
        isLessonDirty = false; // Právě jsme uložili

    } catch (error) {
        console.error("Error updating publish state:", error);
        showToast("Chyba při změně stavu publikace.", true);
        // Vrátit checkbox do původního stavu
        document.getElementById('lesson-published').checked = !isPublished;
        currentLessonData.isPublished = !isPublished;
    }
}

/**
 * Kontroluje, zda ID lekce je dočasné (nová lekce).
 * @param {string} lessonId
 * @returns {boolean}
 */
function isNewLesson(lessonId) {
    // Upraveno pro případ, že lessonId může být null nebo undefined
    return !lessonId || lessonId.startsWith('new-');
}


// --- NÁSLEDUJÍ FUNKCE PRO VKLÁDÁNÍ OBSAHU (Video, Kvíz, Test, Podcast) ---
// Tyto funkce nepotřebují přímé úpravy pro 'professorId',
// protože modifikují pouze lokální objekt 'currentLessonData'.
// Změny se uloží hromadně pomocí 'handleSaveLesson'.


/**
 * Otevře dialog pro vložení/editaci videa.
 * @param {object} editor - Instance TinyMCE editoru.
 * @param {object | null} existingData - Data existujícího videa pro editaci.
 */
function openVideoDialog(editor, existingData = null) {
    const videoId = existingData ? existingData.id : `video-${Date.now()}`;
    const url = existingData ? existingData.url : '';
    const title = existingData ? existingData.title : '';

    editor.windowManager.open({
        title: existingData ? 'Upravit video' : 'Vložit video',
        body: {
            type: 'panel',
            items: [
                { type: 'input', name: 'url', label: 'URL (YouTube, Vimeo)', value: url },
                { type: 'input', name: 'title', label: 'Název (nepovinné)', value: title }
            ]
        },
        buttons: [
            { type: 'cancel', text: 'Zrušit' },
            { type: 'submit', text: 'Vložit', primary: true }
        ],
        onSubmit: (api) => {
            const data = api.getData();
            if (!data.url) {
                api.close();
                return;
            }

            const videoData = {
                id: videoId,
                url: data.url,
                title: data.title
            };

            // Uložíme data do 'currentLessonData'
            if (existingData) {
                // Aktualizujeme
                currentLessonData.videos = currentLessonData.videos.map(v => v.id === videoId ? videoData : v);
            } else {
                // Přidáme
                currentLessonData.videos.push(videoData);
            }
            isLessonDirty = true; // Označíme změnu

            // Vložíme/aktualizujeme placeholder v editoru
            const placeholderHtml = `
                <div class="video-placeholder content-placeholder" data-id="${videoId}" contenteditable="false">
                    <p>🎬 <strong>Video:</strong> ${data.title || data.url}</p>
                    <p>(Dvojklikem upravíte)</p>
                </div>
                <p></p> `;

            if (existingData) {
                // Najdeme a nahradíme existující
                const node = editor.dom.select(`[data-id="${videoId}"]`)[0];
                if (node) {
                    editor.dom.replace(editor.dom.create('div', null, placeholderHtml), node);
                }
            } else {
                // Vložíme nový
                editor.insertContent(placeholderHtml);
            }

            api.close();
        }
    });
}


/**
 * Otevře dialog pro vložení/editaci kvízu.
 * @param {object} editor - Instance TinyMCE editoru.
 * @param {object | null} existingData - Data existujícího kvízu pro editaci.
 */
function openQuizDialog(editor, existingData = null) {
    const quizId = existingData ? existingData.id : `quiz-${Date.now()}`;
    const initialQuestion = existingData ? existingData.question : '';

    // Vytvoříme HTML pro existující odpovědi
    let optionsHtml = (existingData ? existingData.options : [])
        .map((opt, index) => `
            <div class="quiz-option-item">
                <input type.text class="tox-textfield" value="${opt.text}" data-index="${index}">
                <input type="checkbox" class="tox-checkbox" ${opt.isCorrect ? 'checked' : ''} data-index="${index}">
                <button type="button" class="tox-button tox-button--icon tox-button--naked remove-option-btn" title="Odebrat">
                    <svg width="16" height="16" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"></path></svg>
                </button>
            </div>
        `).join('');

    editor.windowManager.open({
        title: existingData ? 'Upravit kvíz' : 'Vložit kvíz',
        size: 'large',
        body: {
            type: 'panel',
            items: [
                { type: 'textarea', name: 'question', label: 'Otázka', value: initialQuestion },
                {
                    type: 'htmlpanel',
                    html: `
                        <label class="tox-label">Odpovědi (zaškrtněte správnou)</label>
                        <div id="quiz-options-container" class="space-y-2 mt-2">
                            ${optionsHtml}
                        </div>
                        <button type="button" id="add-quiz-option-btn" class="tox-button tox-button--secondary mt-2">+ Přidat odpověď</button>
                    `
                }
            ]
        },
        buttons: [
            { type: 'cancel', text: 'Zrušit' },
            { type: 'submit', text: 'Vložit', primary: true }
        ],
        onAction: (api, details) => {
            // Speciální akce pro přidání odpovědi
            if (details.name === 'add-option') {
                const container = document.getElementById('quiz-options-container');
                const newIndex = container.children.length;
                const newItem = document.createElement('div');
                newItem.className = 'quiz-option-item';
                newItem.innerHTML = `
                    <input type.text class="tox-textfield" placeholder="Text odpovědi" data-index="${newIndex}">
                    <input type="checkbox" class="tox-checkbox" data-index="${newIndex}">
                    <button type="button" class="tox-button tox-button--icon tox-button--naked remove-option-btn" title="Odebrat">
                        <svg width="16" height="16" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"></path></svg>
                    </button>
                `;
                newItem.querySelector('.remove-option-btn').onclick = (e) => {
                    e.currentTarget.parentElement.remove();
                };
                container.appendChild(newItem);
            }
        },
        onLoad: (api) => {
            // Přidání listeneru na tlačítko "Přidat odpověď"
            document.getElementById('add-quiz-option-btn').onclick = () => {
                api.dispatch('Action', { name: 'add-option' });
            };
            // Přidání listenerů na existující tlačítka "Odebrat"
            document.querySelectorAll('.remove-option-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.currentTarget.parentElement.remove();
                };
            });
        },
        onSubmit: (api) => {
            const data = api.getData();
            const options = [];

            document.querySelectorAll('#quiz-options-container .quiz-option-item').forEach((item, index) => {
                const text = item.querySelector('input[type\\.text]').value; // Escapovaný typ
                const isCorrect = item.querySelector('input[type="checkbox"]').checked;
                if (text) {
                    options.push({ text, isCorrect });
                }
            });

            if (!data.question || options.length < 2) {
                showToast("Kvíz musí mít otázku a alespoň 2 odpovědi.", true);
                return; // Nezavírat dialog
            }

            const quizData = {
                id: quizId,
                question: data.question,
                options: options
            };

            // Uložíme data do 'currentLessonData'
            if (existingData) {
                currentLessonData.quizzes = currentLessonData.quizzes.map(q => q.id === quizId ? quizData : q);
            } else {
                currentLessonData.quizzes.push(quizData);
            }
            isLessonDirty = true;

            // Vložíme/aktualizujeme placeholder
            const placeholderHtml = `
                <div class="quiz-placeholder content-placeholder" data-id="${quizId}" contenteditable="false">
                    <p>❓ <strong>Kvíz:</strong> ${data.question}</p>
                    <p>(Dvojklikem upravíte)</p>
                </div>
                <p></p>
            `;

            if (existingData) {
                const node = editor.dom.select(`[data-id="${quizId}"]`)[0];
                if (node) {
                    editor.dom.replace(editor.dom.create('div', null, placeholderHtml), node);
                }
            } else {
                editor.insertContent(placeholderHtml);
            }

            api.close();
        }
    });
}


/**
 * Otevře dialog pro vložení/editaci testu (podobný kvízu, ale může mít více otázek).
 * @param {object} editor - Instance TinyMCE editoru.
 * @param {object | null} existingData - Data existujícího testu pro editaci.
 */
function openTestDialog(editor, existingData = null) {
    const testId = existingData ? existingData.id : `test-${Date.now()}`;
    const initialTitle = existingData ? existingData.title : 'Nový test';

    // Zjednodušený dialog, který pouze vloží placeholder
    // TODO: V budoucnu rozšířit o plnohodnotný editor testů

    editor.windowManager.open({
        title: existingData ? 'Upravit test' : 'Vložit test',
        body: {
            type: 'panel',
            items: [
                { type: 'input', name: 'title', label: 'Název testu', value: initialTitle }
            ]
        },
        buttons: [
            { type: 'cancel', text: 'Zrušit' },
            { type: 'submit', text: 'Vložit', primary: true }
        ],
        onSubmit: (api) => {
            const data = api.getData();
            if (!data.title) {
                api.close();
                return;
            }

            const testData = {
                id: testId,
                title: data.title,
                questions: existingData ? existingData.questions : [] // Otázky by se editovaly jinde
            };

            // Uložíme data do 'currentLessonData'
            if (existingData) {
                currentLessonData.tests = currentLessonData.tests.map(t => t.id === testId ? testData : t);
            } else {
                currentLessonData.tests.push(testData);
            }
            isLessonDirty = true;

            // Vložíme/aktualizujeme placeholder
            const placeholderHtml = `
                <div class="test-placeholder content-placeholder" data-id="${testId}" contenteditable="false">
                    <p>✅ <strong>Test:</strong> ${data.title}</p>
                    <p>(Dvojklikem upravíte)</p>
                </div>
                <p></p>
            `;

            if (existingData) {
                const node = editor.dom.select(`[data-id="${testId}"]`)[0];
                if (node) {
                    editor.dom.replace(editor.dom.create('div', null, placeholderHtml), node);
                }
            } else {
                editor.insertContent(placeholderHtml);
            }

            api.close();
        }
    });
}


/**
 * Otevře dialog pro vložení/editaci podcastu (Spotify).
 * @param {object} editor - Instance TinyMCE editoru.
 * @param {object | null} existingData - Data existujícího podcastu pro editaci.
 */
function openPodcastDialog(editor, existingData = null) {
    const podcastId = existingData ? existingData.id : `podcast-${Date.now()}`;
    const url = existingData ? existingData.url : '';
    const title = existingData ? existingData.title : '';

    editor.windowManager.open({
        title: existingData ? 'Upravit podcast' : 'Vložit podcast',
        body: {
            type: 'panel',
            items: [
                { type: 'input', name: 'url', label: 'URL (Spotify embed)', value: url },
                { type: 'input', name: 'title', label: 'Název (nepovinné)', value: title }
            ]
        },
        buttons: [
            { type: 'cancel', text: 'Zrušit' },
            { type: 'submit', text: 'Vložit', primary: true }
        ],
        onSubmit: (api) => {
            const data = api.getData();
            if (!data.url) {
                api.close();
                return;
            }

            const podcastData = {
                id: podcastId,
                url: data.url,
                title: data.title
            };

            // Uložíme data do 'currentLessonData'
            if (existingData) {
                currentLessonData.podcasts = currentLessonData.podcasts.map(p => p.id === podcastId ? podcastData : p);
            } else {
                currentLessonData.podcasts.push(podcastData);
            }
            isLessonDirty = true;

            // Vložíme/aktualizujeme placeholder
            const placeholderHtml = `
                <div class="podcast-placeholder content-placeholder" data-id="${podcastId}" contenteditable="false">
                    <p>🎧 <strong>Podcast:</strong> ${data.title || data.url}</p>
                    <p>(Dvojklikem upravíte)</p>
                </div>
                <p></p>
            `;

            if (existingData) {
                const node = editor.dom.select(`[data-id="${podcastId}"]`)[0];
                if (node) {
                    editor.dom.replace(editor.dom.create('div', null, placeholderHtml), node);
                }
            } else {
                editor.insertContent(placeholderHtml);
            }

            api.close();
        }
    });
}
