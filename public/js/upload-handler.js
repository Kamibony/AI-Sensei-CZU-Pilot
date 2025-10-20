// public/js/upload-handler.js

import { getStorage, ref, uploadBytesResumable, getDownloadURL, listAll, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { showToast } from './utils.js';
import * as firebaseInit from './firebase-init.js'; // Potrebujeme pre db (aj keď sa tu priamo nepoužíva, môže byť v budúcnosti)

let currentUploadTasks = {}; // Store ongoing uploads for cancellation or progress tracking
let selectedFilesForGeneration = []; // Store files selected for context

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

    const storage = getStorage(firebaseInit.app); // Získame storage z inicializovanej app

    Array.from(files).forEach(file => {
        // Basic validation (e.g., file type, size)
        if (file.type !== 'application/pdf') {
            showToast(`Soubor ${file.name} není PDF. Nahrávejte pouze PDF soubory.`, true);
            return;
        }
        if (file.size > 10 * 1024 * 1024) { // Limit 10MB
            showToast(`Soubor ${file.name} je příliš velký (limit 10MB).`, true);
            return;
        }

        // ===== OPRAVA 1: Cesta opravená na 'courses/...' =====
        // Súbory sa budú nahrávať do 'courses/${courseId}/media'
        const filePath = `courses/${courseId}/media/${file.name}`;
        // ================================================
        const storageRef = ref(storage, filePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        // Create UI element for progress
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
                 deleteButton.onclick = () => handleDeleteFile(storageRef, listItem, listElementId); // Posielame ID
                delete currentUploadTasks[fileId];
                showToast(`Chyba při nahrávání souboru ${file.name}.`, true);
            },
            async () => {
                // Upload completed successfully
                statusText.textContent = 'Hotovo';
                statusText.classList.remove('text-red-500');
                statusText.classList.add('text-green-600');
                progressBarContainer.classList.add('hidden');
                cancelButton.classList.add('hidden');
                 deleteButton.classList.remove('hidden'); // Show delete button after successful upload
                 deleteButton.onclick = () => handleDeleteFile(storageRef, listItem, listElementId); // Posielame ID
                delete currentUploadTasks[fileId];
                showToast(`Soubor ${file.name} úspěšně nahrán.`);
                 // Po úspešnom nahraní obnovíme zoznam súborov
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
    // =======================================================

    mediaListElement.innerHTML = '<li class="text-sm text-gray-500">Načítám soubory...</li>'; // Loading indicator

    try {
        const storage = getStorage(firebaseInit.app);
        
        // ===== OPRAVA 2: Cesta opravená na 'courses/...' =====
        // Načítame súbory z 'courses/${courseId}/media'
        const listRef = ref(storage, `courses/${courseId}/media`);
        // ================================================
        
        const res = await listAll(listRef);

        if (res.items.length === 0) {
            mediaListElement.innerHTML = '<li class="text-sm text-gray-400 italic">Zatím nebyly nahrány žádné soubory.</li>';
            return;
        }

        mediaListElement.innerHTML = ''; // Clear loading/previous items
        res.items.forEach((itemRef) => {
            const listItem = document.createElement('li');
            // Give a unique ID based on full path for potential selection later
            const fileId = `file-${itemRef.fullPath.replace(/[^a-zA-Z0-9]/g, '-')}`;
            listItem.id = fileId;
            listItem.className = 'bg-gray-100 p-2 rounded flex justify-between items-center group'; // Add group for hover effect
            
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

            // Add delete functionality
            const deleteButton = listItem.querySelector('.delete-file-btn');
            // ===== OPRAVA: Posielame ID zoznamu, ktorý sa má obnoviť =====
            deleteButton.onclick = () => handleDeleteFile(itemRef, listItem, listElementId);

            // Add selection functionality (add to selectedFilesForGeneration array)
             const checkbox = listItem.querySelector('.file-select-checkbox');
             
             // Zaškrtneme checkboxy, ktoré už sú vo výbere
             if (selectedFilesForGeneration.some(f => f.fullPath === itemRef.fullPath)) {
                 checkbox.checked = true;
             }

             checkbox.addEventListener('change', (e) => {
                 const filePath = e.target.dataset.filePath;
                 const fileName = e.target.dataset.fileName;
                 if (e.target.checked) {
                     // Check if already added
                     if (!selectedFilesForGeneration.some(f => f.fullPath === filePath)) {
                         selectedFilesForGeneration.push({ name: fileName, fullPath: filePath });
                     }
                 } else {
                     selectedFilesForGeneration = selectedFilesForGeneration.filter(f => f.fullPath !== filePath);
                 }
                 // Aktualizujeme VŽDY zoznam v editore (RAG list)
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
// ===== OPRAVA: Prijíma listElementId na obnovenie =====
async function handleDeleteFile(fileRef, listItemElement, listElementId) {
    if (!confirm(`Opravdu chcete smazat soubor "${fileRef.name}"? Tato akce je nevratná.`)) {
        return;
    }

    try {
        await deleteObject(fileRef);
        listItemElement.remove(); // Remove from UI
        // Remove from selection if it was selected
        selectedFilesForGeneration = selectedFilesForGeneration.filter(f => f.fullPath !== fileRef.fullPath);
        
        // Obnovíme oba zoznamy pre istotu
        renderSelectedFiles(); // Update RAG list
        if (listElementId) {
             renderMediaLibraryFiles("main-course", listElementId); 
        }

        showToast(`Soubor "${fileRef.name}" byl smazán.`);
    } catch (error) {
        console.error("Error deleting file:", error);
        showToast(`Nepodařilo se smazat soubor "${fileRef.name}".`, true);
    }
}


// --- Functions for managing file selection for generation (RAG) ---

// Called by editor-handler to display selected files in the RAG UI
export function renderSelectedFiles() {
    const listElement = document.getElementById('selected-files-list-rag'); // ID z createDocumentSelectorUI in editor-handler.js
    
    // Check if the RAG list element exists before trying to manipulate it
    if (!listElement) {
         return; 
    }

    if (selectedFilesForGeneration.length === 0) {
        listElement.innerHTML = '<li>Žádné soubory nevybrány.</li>';
    } else {
        listElement.innerHTML = selectedFilesForGeneration.map(file => `<li>${file.name}</li>`).join('');
    }
}

// Called by editor-handler to get the list of selected file paths for generation
export function getSelectedFiles() {
    return selectedFilesForGeneration;
}

// Called by editor-handler when opening the editor for a new/different lesson, to clear RAG selection
export function clearSelectedFiles() {
    selectedFilesForGeneration = []; // Reset the array
    
    // Attempt to update the RAG list in the editor UI (if it exists)
    const listElement = document.getElementById('selected-files-list-rag');
    if (listElement) {
        renderSelectedFiles(); // Re-render the RAG list (which will now be empty)
    }
    
    // Also uncheck checkboxes in the media library UI (if it's currently displayed)
    // ===== OPRAVA: Hľadáme checkboxy v OBOCH možných zoznamoch =====
    document.querySelectorAll('#course-media-list .file-select-checkbox:checked').forEach(cb => cb.checked = false);
    document.querySelectorAll('#modal-media-list .file-select-checkbox:checked').forEach(cb => cb.checked = false);
    // ========================================================
    
    console.log("Cleared selected files for generation."); 
}
