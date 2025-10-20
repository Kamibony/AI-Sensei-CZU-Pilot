// public/js/upload-handler.js

import { getStorage, ref, uploadBytesResumable, getDownloadURL, listAll, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { showToast } from './utils.js';
import * as firebaseInit from './firebase-init.js'; 

let currentUploadTasks = {}; 
let selectedFilesForGeneration = []; 

// Initialize upload functionality for a specific course/context
export function initializeCourseMediaUpload(courseId = "main-course") {
    const fileInput = document.getElementById('course-media-file-input');
    const uploadArea = document.getElementById('course-media-upload-area');
    const mediaList = document.getElementById('course-media-list');

    if (!fileInput || !uploadArea || !mediaList) {
        console.warn('Upload elements not found. Skipping initialization.');
        return;
    }

    // Handle file selection via button/input click
    fileInput.addEventListener('change', (e) => {
        // Použijeme ID "course-media-list" špecifické pre túto záložku
        handleFileUpload(e.target.files, courseId, "course-media-list");
    });

    // Handle file selection via drag and drop
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('bg-green-50', 'border-green-400');
    });
    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('bg-green-50', 'border-green-400');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('bg-green-50', 'border-green-400');
        if (e.dataTransfer.files) {
            // Použijeme ID "course-media-list" špecifické pre túto záložku
            handleFileUpload(e.dataTransfer.files, courseId, "course-media-list");
        }
    });

    // Initial load of existing files
    // Použijeme ID "course-media-list" špecifické pre túto záložku
    renderMediaLibraryFiles(courseId, "course-media-list");
}

// Handle the actual file upload process
// ===== OPRAVA: mediaListElement je teraz listElementId (string) =====
function handleFileUpload(files, courseId, listElementId) {
    if (!files || files.length === 0) return;

    // Nájdeme element až tu
    const mediaListElement = document.getElementById(listElementId);
    if (!mediaListElement) {
        console.error(`handleFileUpload: Element ID "${listElementId}" not found.`);
        return;
    }

    const storage = getStorage(firebaseInit.app); 

    Array.from(files).forEach(file => {
        if (file.type !== 'application/pdf') {
            showToast(`Soubor ${file.name} není PDF. Nahrávejte pouze PDF soubory.`, true);
            return;
        }
        if (file.size > 10 * 1024 * 1024) { // Limit 10MB
            showToast(`Soubor ${file.name} je příliš velký (limit 10MB).`, true);
            return;
        }

        // ===== OPRAVA 1: Cesta opravená na 'courses/...' =====
        const filePath = `courses/${courseId}/media/${file.name}`;
        // ================================================
        const storageRef = ref(storage, filePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        const fileId = `upload-${Date.now()}-${Math.random().toString(16).substring(2)}`;
        const listItem = document.createElement('li');
        listItem.id = fileId;
        listItem.className = 'bg-gray-100 p-2 rounded flex justify-between items-center';
        listItem.innerHTML = `
            <span class="text-sm font-medium text-gray-700">${file.name}</span>
            <div class="flex items-center space-x-2">
                <span class="text-xs text-gray-500 status">Nahrávám...</span>
                <div class="w-20 h-2 bg-gray-300 rounded-full overflow-hidden progress-bar hidden">
                    <div class="h-full bg-blue-500 transition-all duration-150 ease-linear" style="width: 0%;"></div>
                </div>
                <button class="cancel-upload-btn text-red-500 hover:text-red-700 hidden" title="Zrušit nahrávání">✕</button>
                 <button class="delete-file-btn text-red-500 hover:text-red-700 hidden" title="Smazat soubor">🗑️</button>
            </div>
        `;
        mediaListElement.appendChild(listItem);

        const progressBarContainer = listItem.querySelector('.progress-bar');
        const progressBar = progressBarContainer.querySelector('div');
        const statusText = listItem.querySelector('.status');
        const cancelButton = listItem.querySelector('.cancel-upload-btn');
        const deleteButton = listItem.querySelector('.delete-file-btn');

        currentUploadTasks[fileId] = uploadTask;

        cancelButton.classList.remove('hidden');
        cancelButton.onclick = () => {
            uploadTask.cancel();
            listItem.remove();
            delete currentUploadTasks[fileId];
            showToast(`Nahrávání souboru ${file.name} zrušeno.`);
        };

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                progressBarContainer.classList.remove('hidden');
                progressBar.style.width = `${progress}%`;
                statusText.textContent = `${Math.round(progress)}%`;
            },
            (error) => {
                console.error('Upload error:', error);
                statusText.textContent = 'Chyba';
                statusText.classList.add('text-red-500');
                progressBarContainer.classList.add('hidden');
                cancelButton.classList.add('hidden');
                 deleteButton.classList.remove('hidden'); 
                 deleteButton.onclick = () => handleDeleteFile(storageRef, listItem, listElementId); 
                delete currentUploadTasks[fileId];
                showToast(`Chyba při nahrávání souboru ${file.name}.`, true);
            },
            async () => {
                statusText.textContent = 'Hotovo';
                statusText.classList.remove('text-red-500');
                statusText.classList.add('text-green-600');
                progressBarContainer.classList.add('hidden');
                cancelButton.classList.add('hidden');
                 deleteButton.classList.remove('hidden'); 
                 deleteButton.onclick = () => handleDeleteFile(storageRef, listItem, listElementId); 
                delete currentUploadTasks[fileId];
                showToast(`Soubor ${file.name} úspěšně nahrán.`);
                 renderMediaLibraryFiles(courseId, listElementId);
            }
        );
    });
}

// Render the list of files already in Storage
// ===== OPRAVA: Funkcia teraz prijíma ID elementu zoznamu =====
export async function renderMediaLibraryFiles(courseId = "main-course", listElementId = "course-media-list") {
    
    const mediaListElement = document.getElementById(listElementId);
    if (!mediaListElement) {
        console.warn(`Element '#${listElementId}' not found. Cannot render media library files.`);
        return;
    }

    mediaListElement.innerHTML = '<li class="text-sm text-gray-500">Načítám soubory...</li>'; 

    try {
        const storage = getStorage(firebaseInit.app);
        
        // ===== OPRAVA 2: Cesta opravená na 'courses/...' =====
        const listRef = ref(storage, `courses/${courseId}/media`);
        // ================================================
        
        const res = await listAll(listRef);

        if (res.items.length === 0) {
            mediaListElement.innerHTML = '<li class="text-sm text-gray-400 italic">Zatím nebyly nahrány žádné soubory.</li>';
            return;
        }

        mediaListElement.innerHTML = ''; 
        res.items.forEach((itemRef) => {
            const listItem = document.createElement('li');
            const fileId = `file-${itemRef.fullPath.replace(/[^a-zA-Z0-9]/g, '-')}`;
            listItem.id = fileId;
            listItem.className = 'bg-gray-100 p-2 rounded flex justify-between items-center group';
            
            // ===== OPRAVA 3: Odstránené 'hidden' a 'group-hover:inline-block' =====
            listItem.innerHTML = `
                <span class="text-sm font-medium text-gray-700 truncate mr-2">${itemRef.name}</span>
                 <div class="flex items-center space-x-2 flex-shrink-0">
                     <input type="checkbox" class="file-select-checkbox h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" data-file-path="${itemRef.fullPath}" data-file-name="${itemRef.name}">
                    <button class="delete-file-btn text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity" title="Smazat soubor">🗑️</button>
                 </div>
            `;
            // ====================================================================
            
            mediaListElement.appendChild(listItem);

            const deleteButton = listItem.querySelector('.delete-file-btn');
            deleteButton.onclick = () => handleDeleteFile(itemRef, listItem, listElementId);

             const checkbox = listItem.querySelector('.file-select-checkbox');
             
             if (selectedFilesForGeneration.some(f => f.fullPath === itemRef.fullPath)) {
                 checkbox.checked = true;
             }

             checkbox.addEventListener('change', (e) => {
                 const filePath = e.target.dataset.filePath;
                 const fileName = e.target.dataset.fileName;
                 if (e.target.checked) {
                     if (!selectedFilesForGeneration.some(f => f.fullPath === filePath)) {
                         selectedFilesForGeneration.push({ name: fileName, fullPath: filePath });
                     }
                 } else {
                     selectedFilesForGeneration = selectedFilesForGeneration.filter(f => f.fullPath !== filePath);
                 }
                 renderSelectedFiles(); 
             });

        });
    } catch (error) {
        console.error("Error listing files:", error);
        mediaListElement.innerHTML = '<li class="text-sm text-red-500">Nepodařilo se načíst soubory.</li>';
        showToast("Chyba při načítání seznamu souborů.", true);
    }
}

// Handle deleting a file from Storage
async function handleDeleteFile(fileRef, listItemElement, listElementId) {
    if (!confirm(`Opravdu chcete smazat soubor "${fileRef.name}"? Tato akce je nevratná.`)) {
        return;
    }

    try {
        await deleteObject(fileRef);
        listItemElement.remove(); 
        selectedFilesForGeneration = selectedFilesForGeneration.filter(f => f.fullPath !== fileRef.fullPath);
        
        renderSelectedFiles(); 
        if (listElementId) {
             renderMediaLibraryFiles("main-course", listElementId); 
        }
        
        // ===== OPRAVA: Musíme prekresliť aj druhý zoznam, ak existuje =====
        const otherListId = listElementId === "course-media-list" ? "modal-media-list" : "course-media-list";
        if (document.getElementById(otherListId)) {
            renderMediaLibraryFiles("main-course", otherListId);
        }
        // ==========================================================

        showToast(`Soubor "${fileRef.name}" byl smazán.`);
    } catch (error) {
        console.error("Error deleting file:", error);
        showToast(`Nepodařilo se smazat soubor "${fileRef.name}".`, true);
    }
}


// --- Functions for managing file selection for generation (RAG) ---

export function renderSelectedFiles() {
    const listElement = document.getElementById('selected-files-list-rag'); 
    
    if (!listElement) {
         return; 
    }

    if (selectedFilesForGeneration.length === 0) {
        listElement.innerHTML = '<li>Žádné soubory nevybrány.</li>';
    } else {
        listElement.innerHTML = selectedFilesForGeneration.map(file => `<li>${file.name}</li>`).join('');
    }
}

export function getSelectedFiles() {
    return selectedFilesForGeneration;
}

// ===== NOVÁ FUNKCIA =====
/**
 * Načíta pole súborov (zvyčajne z lesson objektu) do globálneho stavu.
 * @param {Array<Object>} files - Pole objektov súborov, napr. [{ name: "file.pdf", fullPath: "courses/..." }]
 */
export function loadSelectedFiles(files) {
    if (Array.isArray(files)) {
        selectedFilesForGeneration = [...files]; // Vytvorí kópiu poľa
    } else {
        selectedFilesForGeneration = [];
    }
    // Hneď aj prekreslíme RAG zoznam v editore, ak existuje
    renderSelectedFiles();
}

// ===== UPRAVENÁ FUNKCIA =====
export function clearSelectedFiles() {
    selectedFilesForGeneration = []; // Reset the array
    
    const listElement = document.getElementById('selected-files-list-rag');
    if (listElement) {
        renderSelectedFiles(); 
    }
    
    console.log("Cleared selected files for generation."); 
}
