import { doc, addDoc, updateDoc, collection, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from './firebase-init.js';
import { showToast } from './utils.js';
import { callGeminiApi, callGeminiForJson, callGenerateFromDocument } from './gemini-api.js';
import { initializeUpload } from './upload-handler.js';

let currentLesson = null;

// TÁTO FUNKCIA JE TERAZ INTERNÁ A NIE JE EXPORTOVANÁ
function attachEditorEventListeners(viewId) {
    if (viewId === 'details') {
        document.getElementById('save-lesson-btn')?.addEventListener('click', handleSaveLesson);
    }
    if (viewId === 'docs') {
        // Použijeme setTimeout, aby sme zaistili, že DOM je pripravený
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

// Ostatné funkcie ako handleSaveLesson, handleGeneration, atď., zostávajú rovnaké
// (Pre úplnosť ich sem skopírujem z predchádzajúcej odpovede)

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
            Object.assign(currentLesson, lessonData);
            showToast('Lekce byla úspěšně aktualizována.');
            document.getElementById('editor-lesson-title').textContent = title;
        } else {
            const docRef = await addDoc(collection(db, 'lessons'), {
                ...lessonData,
                status: 'Naplánováno',
                creationDate: new Date().toISOString().split('T')[0],
                createdAt: serverTimestamp()
            });
            currentLesson = { id: docRef.id, ...lessonData };
            showToast('Lekce byla úspěšně vytvořena.');
            const sidebar = document.getElementById('professor-sidebar');
            renderEditorMenu(sidebar, currentLesson);
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
            let finalPrompt = userPrompt;
            let isJson = ['presentation', 'quiz', 'test', 'post'].includes(viewId);
            finalPrompt = `Using the document provided, generate content for: ${userPrompt}`;
            const ragResult = await callGenerateFromDocument({ filePaths: [filePath], prompt: finalPrompt });
            if (ragResult.error) throw new Error(ragResult.error);
            rawResultForSaving = ragResult.text;
            result = isJson ? JSON.parse(ragResult.text) : ragResult;
        } else {
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
                case 'quiz':
                    result = await callGeminiForJson(`Vytvoř interaktivní kvíz na základě tohoto zadání: "${userPrompt}". Kvíz by měl obsahovat několik otázek, každá s několika možnostmi odpovědi a označením správné odpovědi.`, { type: "OBJECT", properties: { questions: { type: "ARRAY", items: { type: "OBJECT", properties: { question_text: { type: "STRING" }, options: { type: "ARRAY", items: { type: "STRING" } }, correct_option_index: { type: "NUMBER" } }, required: ["question_text", "options", "correct_option_index"] } } } });
                    rawResultForSaving = result;
                    break;
                case 'test':
                    const questionCount = document.getElementById('question-count-input').value;
                    const difficulty = document.getElementById('difficulty-select').value;
                    const questionTypes = document.getElementById('type-select').value;
                    result = await callGeminiForJson(`Vytvoř test na téma "${userPrompt}" s ${questionCount} otázkami. Obtížnost: ${difficulty}. Typy otázek: ${questionTypes}.`, { type: "OBJECT", properties: { questions: { type: "ARRAY", items: { type: "OBJECT", properties: { question_text: { type: "STRING" }, type: {type: "STRING", enum: ["multiple_choice", "true_false"]}, options: { type: "ARRAY", items: { type: "STRING" } }, correct_option_index: { type: "NUMBER" } }, required: ["question_text", "type", "options", "correct_option_index"] } } } });
                    rawResultForSaving = result;
                    break;
                case 'post':
                    const episodeCount = document.getElementById('episode-count-input').value;
                    result = await callGeminiForJson(`Vytvoř sérii ${episodeCount} podcast epizod na téma "${userPrompt}". Každá epizoda by měla mít název a scénář.`, { type: "OBJECT", properties: { episodes: { type: "ARRAY", items: { type: "OBJECT", properties: { title: { type: "STRING" }, script: { type: "STRING" } }, required: ["title", "script"] } } } });
                    rawResultForSaving = result;
                    break;
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
                const fieldMapping = { 'text': 'content', 'presentation': 'presentationData', 'quiz': 'quizData', 'test': 'testData', 'post': 'postData' };
                const contentToSave = (viewId === 'text') ? outputEl.innerHTML : rawResultForSaving;
                handleSaveGeneratedContent(currentLesson, fieldMapping[viewId], contentToSave);
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
        case 'quiz':
            const questionsHtml = result.questions.map((q, i) => {
                const optionsHtml = q.options.map((opt, j) => `<div class="text-sm p-2 rounded-lg ${j === q.correct_option_index ? 'bg-green-100 font-semibold' : 'bg-slate-50'}">${opt}</div>`).join('');
                return `<div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm">
                            <h4 class="font-bold text-green-700">Otázka ${i+1}: ${q.question_text}</h4>
                            <div class="mt-2 space-y-2">${optionsHtml}</div>
                        </div>`;
            }).join('');
            outputEl.innerHTML = questionsHtml;
            break;
        case 'test':
            const testQuestionsHtml = result.questions.map((q, i) => {
                const optionsHtml = q.options.map((opt, j) => `<div class="text-sm p-2 rounded-lg ${j === q.correct_option_index ? 'bg-green-100 font-semibold' : 'bg-slate-50'}">${opt}</div>`).join('');
                return `<div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm">
                            <h4 class="font-bold text-green-700">Otázka ${i+1}: ${q.question_text} (${q.type === 'true_false' ? 'Pravda/Nepravda' : 'Výběr z možností'})</h4>
                            <div class="mt-2 space-y-2">${optionsHtml}</div>
                        </div>`;
            }).join('');
            outputEl.innerHTML = testQuestionsHtml;
            break;
        case 'post':
            const episodesHtml = result.episodes.map((episode, i) => `<div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm"><h4 class="font-bold text-green-700">Epizoda ${i+1}: ${episode.title}</h4><p class="mt-2 text-sm text-slate-600">${episode.script.replace(/\n/g, '<br>')}</p></div>`).join('');
            outputEl.innerHTML = episodesHtml;
            break;
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


// --- EXPORTOVANÉ FUNKCIE ---
// Toto sú jediné dve funkcie, ktoré `professor.js` potrebuje.
export { renderEditorMenu, showEditorContent };
