// Súbor: public/js/upload-handler.js (Nová verzia s dynamickou inicializáciou)

import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { getStorage, ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from './firebase-init.js';
import { showToast } from "./utils.js";
import { translationService } from "./utils/translation-service.js";

// Hlavná funkcia na spracovanie nahrávania súborov (Bulk upload)
export async function handleFileUpload(files, courseId, progressContainer, mediaListContainer, onCompleteCallback) {
    if (!files || files.length === 0) return;

    progressContainer.classList.remove('hidden');
    progressContainer.innerHTML = ''; // Vyčistíme staré progressy

    const user = firebaseInit.auth.currentUser;
    if (!user) {
        showToast(translationService.t('common.upload_login_required'), true);
        return;
    }

    // Spracujeme každý súbor samostatne
    const uploadPromises = Array.from(files).map(file =>
        uploadSingleFile(file, courseId, user, progressContainer)
    );

    try {
        await Promise.all(uploadPromises);
        showToast(translationService.t('common.upload_success_all'));
        if (onCompleteCallback) onCompleteCallback(); // Zavoláme callback
    } catch (error) {
        console.error("Některé nahrávání selhala:", error);
        showToast(translationService.t('common.upload_failed_some'), true);
        if (onCompleteCallback) onCompleteCallback(); // Zavoláme callback aj pri chybe
    } finally {
        // Skryjeme progress bar po chvíli
        setTimeout(() => {
            if (progressContainer) progressContainer.classList.add('hidden');
        }, 3000);
    }
}

// Pomocná funkcia na nahratie JEDNÉHO súboru
async function uploadSingleFile(file, courseId, user, progressContainer) {
    // Vytvorenie UI pre progress bar
    const progressElement = document.createElement('div');
    progressElement.className = 'upload-progress-item p-2 bg-slate-100 rounded mb-2';
    progressElement.innerHTML = `
    <div class="flex justify-between items-center text-xs mb-1">
        <span class="font-medium text-slate-700 truncate pr-2">${file.name}</span>
        <span class="percentage text-slate-500">0%</span>
    </div>
    <div class="w-full bg-slate-200 rounded-full h-1.5">
        <div class="progress-bar bg-blue-600 h-1.5 rounded-full" style="width: 0%"></div>
    </div>
    `;
    progressContainer.appendChild(progressElement);
    const progressBar = progressElement.querySelector('.progress-bar');
    const percentageText = progressElement.querySelector('.percentage');

    try {
        // ===== KĽÚČOVÁ ZMENA: Dynamická inicializácia =====
        // Funkcie inicializujeme až tesne pred ich použitím,
        // čím zabezpečíme, že `firebaseInit.functions` už je definované.
        const getSecureUploadUrl = httpsCallable(firebaseInit.functions, 'getSecureUploadUrl');
        const finalizeUpload = httpsCallable(firebaseInit.functions, 'finalizeUpload');
        const processFileForRAG = httpsCallable(firebaseInit.functions, 'processFileForRAG');
        // =================================================

        // KROK 1: Vypýtame si Signed URL z našej Cloud Function
        percentageText.textContent = translationService.t('common.upload_preparing');
        const result = await getSecureUploadUrl({
            fileName: file.name,
            contentType: file.type,
            courseId: courseId,
            size: file.size
        });

        const { signedUrl, docId, filePath } = result.data;

        // KROK 2: Nahráme súbor pomocou Fetch (mimo Firebase SDK)
        progressBar.style.width = '50%';
        percentageText.textContent = translationService.t('common.upload_uploading');

        const response = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type,
            }
        });

        if (!response.ok) {
            throw new Error(`Nahrávání selhalo se statusem: ${response.status}`);
        }

        // KROK 3: Finalizujeme upload
        progressBar.style.width = '90%';
        progressBar.classList.remove('bg-blue-600');
        progressBar.classList.add('bg-yellow-500');
        percentageText.textContent = translationService.t('common.upload_finalizing');

        await finalizeUpload({ docId: docId, filePath: filePath });

        // KROK 4: Spustíme RAG spracovanie
        progressBar.style.width = '95%';
        percentageText.textContent = translationService.t('common.upload_ai_processing');
        try {
            await processFileForRAG({ fileId: docId });
        } catch (ragError) {
            console.error(`RAG spracovanie pre ${file.name} zlyhalo:`, ragError);
            showToast(translationService.t('common.upload_ai_failed_specific').replace('{filename}', file.name), true);
            // Necháme progress na 95% a zmeníme farbu na oranžovú ako varovanie
            progressBar.classList.remove('bg-yellow-500');
            progressBar.classList.add('bg-orange-500');
            percentageText.textContent = translationService.t('common.upload_ai_error');
            // V tomto prípade nepokračujeme ďalej a nehlásime chybu "vyššie",
            // pretože upload samotný bol úspešný.
            return; // Ukončíme funkciu tu
        }


        // KROK 5: Hotovo
        progressBar.style.width = '100%';
        progressBar.classList.remove('bg-yellow-500');
        progressBar.classList.add('bg-green-600');
        percentageText.textContent = translationService.t('common.upload_done');

    } catch (error) {
        console.error(`Nahrávání souboru ${file.name} selhalo:`, error);
        progressBar.classList.remove('bg-blue-600');
        progressBar.classList.add('bg-red-600');
        percentageText.textContent = translationService.t('common.upload_error');
        if (error.message) {
            showToast(`Chyba: ${error.message}`, true);
        }
        throw error;
    }
}

// --- OSTATNÉ FUNKCIE (napr. RAG, Media Library) ---
// Tieto funkcie zostávajú, pretože sú potrebné pre iné časti aplikácie.

let selectedFiles = [];
export function clearSelectedFiles() { selectedFiles = []; }
export function getSelectedFiles() { return [...selectedFiles]; }
// ... (všetky tvoje ostatné exportované funkcie) ...

export function loadSelectedFiles(initialFiles = []) {
     clearSelectedFiles();
     if (!Array.isArray(initialFiles)) initialFiles = [];
     
     selectedFiles = initialFiles.map(file => {
        if (typeof file === 'string') {
            return { name: file.split('/').pop(), fullPath: file };
        } else if (file && file.name && file.fullPath) {
            return file;
        }
        return null;
     }).filter(file => file !== null);
     console.log("Loaded RAG files (normalized):", selectedFiles);
}

export function renderSelectedFiles(listElementId = "selected-files-list-rag") {
    const listEl = document.getElementById(listElementId);
    if (!listEl) return;

    if (selectedFiles.length === 0) {
        listEl.innerHTML = `<li>${translationService.t('common.no_files_selected')}</li>`;
    } else {
        listEl.innerHTML = selectedFiles.map((file, index) => `
            <li class="flex items-center justify-between text-xs text-slate-700 group">
                <span class="truncate pr-2" title="${file.fullPath}">${file.name}</span>
                <button data-index="${index}" class="remove-rag-file-btn p-0.5 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
            </li>
        `).join('');

        listEl.querySelectorAll('.remove-rag-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const indexToRemove = parseInt(e.currentTarget.dataset.index);
                selectedFiles.splice(indexToRemove, 1);
                renderSelectedFiles(listElementId);
            });
        });
    }
}

export async function renderMediaLibraryFiles(courseId, listElementId) {
    const listEl = document.getElementById(listElementId);
    if (!listEl) return;
    listEl.innerHTML = `<p class="text-slate-500 text-sm">${translationService.t('common.library_loading')}</p>`;

    try {
        const user = firebaseInit.auth.currentUser;
        if (!user) {
            listEl.innerHTML = `<p class="text-red-500 text-sm">${translationService.t('common.library_login_required')}</p>`;
            return;
        }

        let q;
        if (user.email === 'profesor@profesor.cz') {
            q = query(collection(firebaseInit.db, "fileMetadata"), where("courseId", "==", courseId));
        } else {
            q = query(collection(firebaseInit.db, "fileMetadata"),
                where("courseId", "==", courseId),
                where("ownerId", "==", user.uid)
            );
        }
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            listEl.innerHTML = `<p class="text-slate-500 text-sm">${translationService.t('common.library_empty')}</p>`;
            return;
        }

        let allFiles = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return { name: data.fileName, fullPath: data.storagePath, id: doc.id };
        });

        allFiles.sort((a,b) => a.name.localeCompare(b.name));

        listEl.innerHTML = '';
        allFiles.forEach(file => {
            const isSelected = selectedFiles.some(sf => sf.fullPath === file.fullPath);
            const li = document.createElement('li');
            li.className = "flex items-center justify-between p-2 rounded hover:bg-slate-100 text-sm";

            const label = document.createElement('label');
            label.className = "flex items-center cursor-pointer flex-grow mr-2 min-w-0";

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = "mr-2 h-4 w-4 text-green-600 border-slate-300 rounded focus:ring-green-500";
            checkbox.dataset.fullpath = file.fullPath;
            checkbox.dataset.filename = file.name;
            checkbox.checked = isSelected;
            checkbox.addEventListener('change', handleCheckboxChange);

            const span = document.createElement('span');
            span.className = "text-slate-700 truncate";
            span.title = file.name;
            span.textContent = file.name;

            label.appendChild(checkbox);
            label.appendChild(span);
            li.appendChild(label);
            listEl.appendChild(li);
        });

    } catch (error) {
        console.error("Error listing files from Firestore:", error);
        listEl.innerHTML = `<p class="text-red-500 text-sm">${translationService.t('common.library_error')}</p>`;
    }
}

function handleCheckboxChange(e) {
    const checkbox = e.target;
    let rawPath = checkbox.dataset.fullpath;
    // FIX: Sanitize undefined string to ensure fallback logic works
    if (!rawPath || rawPath === 'undefined') rawPath = null;
    const fileData = { name: checkbox.dataset.filename, fullPath: rawPath };
    if (checkbox.checked) {
        if (!selectedFiles.some(f => f.fullPath === fileData.fullPath)) selectedFiles.push(fileData);
    } else {
        selectedFiles = selectedFiles.filter(f => f.fullPath !== fileData.fullPath);
    }
    console.log("Selected RAG files:", selectedFiles);
}

export function initializeCourseMediaUpload(courseId, onUploadCompleteCallback = null, containerElement = document) {
    const uploadArea = containerElement.querySelector('#course-media-upload-area');
    const fileInput = containerElement.querySelector('#course-media-file-input');
    const mediaList = containerElement.querySelector('#course-media-list-container');
    const progressContainer = containerElement.querySelector('#upload-progress-container');

    if (!uploadArea || !fileInput) return;

    uploadArea.addEventListener('click', (e) => {
        if (e.target === uploadArea || e.target.classList.contains('pointer-events-none') || e.target.closest('.pointer-events-none')) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (e) => {
        handleFileUpload(e.target.files, courseId, progressContainer, mediaList, onUploadCompleteCallback);
        fileInput.value = '';
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('border-green-500', 'bg-green-50', 'shadow-inner');
    });
    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        if (!uploadArea.contains(e.relatedTarget)) {
            uploadArea.classList.remove('border-green-500', 'bg-green-50', 'shadow-inner');
        }
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('border-green-500', 'bg-green-50', 'shadow-inner');
        if (e.dataTransfer.files) {
            handleFileUpload(e.dataTransfer.files, courseId, progressContainer, mediaList, onUploadCompleteCallback);
        }
    });
}

export function addSelectedFile(fileData) {
    if (!fileData || !fileData.fullPath) return;
    if (!selectedFiles.some(f => f.fullPath === fileData.fullPath)) {
        selectedFiles.push(fileData);
    }
}

export async function processAndStoreFile(file, courseId, userId, onProgress, onError, onSuccess) {
    try {
        const getSecureUploadUrl = httpsCallable(firebaseInit.functions, 'getSecureUploadUrl');
        const finalizeUpload = httpsCallable(firebaseInit.functions, 'finalizeUpload');

        if (onProgress) onProgress(10);
        const result = await getSecureUploadUrl({
            fileName: file.name,
            contentType: file.type,
            courseId: courseId,
            size: file.size,
        });
        const { signedUrl, docId, filePath } = result.data;

        if (onProgress) onProgress(50);
        const response = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type },
        });

        if (!response.ok) {
            throw new Error(`Upload failed with status: ${response.status}`);
        }

        if (onProgress) onProgress(90);
        await finalizeUpload({ docId, filePath });

        const storage = getStorage(firebaseInit.app);
        const fileRef = ref(storage, filePath);
        const downloadURL = await getDownloadURL(fileRef);

        if (onSuccess) onSuccess(downloadURL, filePath);

    } catch (error) {
        console.error("Error during inline file processing:", error);
        if (onError) onError(error);
    }
}
