import { db } from '../../firebase-init.js';
import { collection, addDoc, serverTimestamp, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from '../../utils.js';
import { initializeEditor } from '../../editor-handler.js';
import { handleRouteChange } from '../../professor.js';

export function renderTimeline(lessons) {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div class="p-4 md:p-6 lg:p-8">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl md:text-3xl font-bold">Časová osa lekcí</h2>
                <button id="add-lesson-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">
                    + Přidat novou lekci
                </button>
            </div>
            <div id="timeline-container" class="space-y-4"></div>
        </div>
    `;

    const container = document.getElementById('timeline-container');
    if (!lessons || lessons.length === 0) {
        container.innerHTML = '<p class="text-gray-500">Zatím nebyly vytvořeny žádné lekce. Klikněte na tlačítko pro přidání nové lekce.</p>';
    } else {
        lessons.forEach(lesson => {
            const lessonElement = document.createElement('div');
            lessonElement.className = 'group p-4 bg-white border rounded-lg shadow-sm cursor-pointer hover:shadow-md hover:border-blue-500 transition-all flex justify-between items-center';
            lessonElement.innerHTML = `
                <div>
                    <h3 class="font-bold text-lg">${lesson.title}</h3>
                    <p class="text-sm text-gray-500">Vytvořeno: ${lesson.createdAt ? new Date(lesson.createdAt.seconds * 1000).toLocaleDateString() : 'Neznámé datum'}</p>
                </div>
                <button class="delete-lesson-btn bg-red-500 text-white px-3 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity" data-lesson-id="${lesson.id}">Smazat</button>
            `;
            
            lessonElement.addEventListener('click', (e) => {
                if (!e.target.classList.contains('delete-lesson-btn')) {
                    openLessonEditor(lesson);
                }
            });

            lessonElement.querySelector('.delete-lesson-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                const lessonId = e.target.getAttribute('data-lesson-id');
                if (confirm(`Opravdu si přejete smazat lekci "${lesson.title}"?`)) {
                    try {
                        await deleteDoc(doc(db, "lessons", lessonId));
                        showToast("Lekce byla úspěšně smazána.");
                        handleRouteChange(); // Re-render the timeline
                    } catch (error) {
                        console.error("Error deleting lesson:", error);
                        showToast("Nepodařilo se smazat lekci.", true);
                    }
                }
            });
            container.appendChild(lessonElement);
        });
    }

    document.getElementById('add-lesson-btn').addEventListener('click', createNewLesson);
}

async function createNewLesson() {
    const title = prompt("Zadejte název nové lekce:");
    if (title && title.trim() !== '') {
        try {
            const docRef = await addDoc(collection(db, "lessons"), {
                title: title,
                createdAt: serverTimestamp(),
                content: { blocks: [] } 
            });
            showToast("Nová lekce byla úspěšně vytvořena!");
            openLessonEditor({ id: docRef.id, title, content: { blocks: [] } });
        } catch (error) {
            console.error("Error adding document: ", error);
            showToast("Nepodařilo se vytvořit novou lekci.", true);
        }
    }
}

function openLessonEditor(lesson) {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
         <div class="p-4 md:p-6 lg:p-8">
            <h2 class="text-2xl font-bold mb-2">Editor Lekce: <span id="lesson-title-display">${lesson.title}</span></h2>
            <p class="text-sm text-gray-500 mb-6">ID Lekce: <span id="lesson-id-display">${lesson.id}</span></p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="md:col-span-2">
                    <div id="editor-container" class="p-4 border rounded bg-white min-h-[400px]"></div>
                    <button id="save-content-btn" class="mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">Uložit obsah</button>
                </div>
                <div class="bg-gray-50 p-4 border rounded-lg">
                    <h3 class="text-lg font-semibold mb-3">AI Nástroje</h3>
                    <div class="space-y-4">
                         <div>
                            <label for="ai-prompt" class="block text-sm font-medium text-gray-700">Prompt pro AI</label>
                            <textarea id="ai-prompt" rows="4" class="w-full mt-1 p-2 border rounded-md shadow-sm"></textarea>
                        </div>
                        <div>
                            <label for="content-type-selector" class="block text-sm font-medium text-gray-700">Typ obsahu</label>
                            <select id="content-type-selector" class="w-full mt-1 p-2 border rounded-md shadow-sm">
                                <option value="text">Text</option>
                                <option value="presentation">Prezentace</option>
                                <option value="quiz">Kvíz</option>
                                <option value="test">Test</option>
                                <option value="podcast">Podcast</option>
                            </select>
                        </div>
                        <button id="generate-content-btn" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">Generovat</button>
                    </div>
                     <h3 class="text-lg font-semibold mt-6 mb-3">Materiály k lekci</h3>
                     <input type="file" id="file-upload-input" class="hidden">
                     <button id="upload-file-btn" class="w-full bg-gray-700 hover:bg-gray-800 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">Nahrát soubor</button>
                     <div id="lesson-materials-list" class="mt-4 space-y-2"></div>
                </div>
            </div>
        </div>
    `;

    // --- TOTO JE KĽÚČOVÁ ZMENA ---
    // Počkáme 50 milisekúnd, aby sa externé skripty stihli načítať
    setTimeout(() => {
        const initialContent = (lesson.content && lesson.content.blocks) ? lesson.content.blocks : [];
        initializeEditor('editor-container', initialContent);
    }, 50);
}
