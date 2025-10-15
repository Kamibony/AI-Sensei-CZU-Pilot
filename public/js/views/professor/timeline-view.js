import { db } from '../../firebase-init.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from '../../utils.js';
import { initializeEditor } from '../../editor-handler.js';

// PRIDANÝ EXPORT
export function renderTimeline(lessons) {
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = `
        <div class="p-8">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-3xl font-bold">Časová osa lekcí</h2>
                <button id="add-lesson-btn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded">
                    + Přidat novou lekci
                </button>
            </div>
            <div id="timeline-container" class="space-y-4"></div>
        </div>
    `;

    const container = document.getElementById('timeline-container');
    if (lessons.length === 0) {
        container.innerHTML = '<p>Zatím nebyly vytvořeny žádné lekce.</p>';
    } else {
        lessons.forEach(lesson => {
            const lessonElement = document.createElement('div');
            lessonElement.className = 'p-4 border rounded shadow-sm cursor-pointer hover:bg-gray-50';
            lessonElement.innerHTML = `
                <h3 class="font-bold">${lesson.title}</h3>
                <p class="text-sm text-gray-500">Vytvořeno: ${lesson.createdAt ? new Date(lesson.createdAt.seconds * 1000).toLocaleDateString() : 'Neznámé datum'}</p>
            `;
            lessonElement.addEventListener('click', () => openLessonEditor(lesson));
            container.appendChild(lessonElement);
        });
    }

    document.getElementById('add-lesson-btn').addEventListener('click', createNewLesson);
}

async function createNewLesson() {
    const title = prompt("Zadejte název nové lekce:");
    if (title) {
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
         <div class="p-8">
            <h2 class="text-2xl font-bold mb-2">Editor Lekce: <span id="lesson-title-display">${lesson.title}</span></h2>
            <p class="text-sm text-gray-500 mb-6">ID Lekce: <span id="lesson-id-display">${lesson.id}</span></p>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="md:col-span-2">
                    <div id="editorjs" class="p-4 border rounded bg-white"></div>
                    <button id="save-content-btn" class="mt-4 bg-green-500 text-white py-2 px-4 rounded">Uložit obsah</button>
                </div>
                
                <div class="bg-gray-50 p-4 border rounded">
                    <h3 class="text-lg font-semibold mb-3">AI Nástroje</h3>
                    <div class="space-y-4">
                         <div>
                            <label for="ai-prompt" class="block text-sm font-medium text-gray-700">Prompt pro AI</label>
                            <textarea id="ai-prompt" rows="4" class="w-full mt-1 p-2 border rounded"></textarea>
                        </div>
                        <div>
                            <label for="content-type-selector" class="block text-sm font-medium text-gray-700">Typ obsahu</label>
                            <select id="content-type-selector" class="w-full mt-1 p-2 border rounded">
                                <option value="text">Text</option>
                                <option value="presentation">Prezentace</option>
                                <option value="quiz">Kvíz</option>
                                <option value="test">Test</option>
                                <option value="podcast">Podcast</option>
                            </select>
                        </div>
                        <button id="generate-content-btn" class="w-full bg-indigo-500 text-white py-2 px-4 rounded">Generovat</button>
                    </div>
                     <h3 class="text-lg font-semibold mt-6 mb-3">Materiály k lekci</h3>
                     <input type="file" id="file-upload-input" class="hidden">
                     <button id="upload-file-btn" class="w-full bg-gray-600 text-white py-2 px-4 rounded">Nahrát soubor</button>
                     <div id="lesson-materials-list" class="mt-4 space-y-2"></div>
                </div>
            </div>
        </div>
    `;
    initializeEditor('editorjs', lesson.content.blocks);
}
