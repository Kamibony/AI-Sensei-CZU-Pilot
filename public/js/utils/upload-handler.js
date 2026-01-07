import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { collection, addDoc, doc, setDoc, updateDoc, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { storage, db, functions, auth } from '../firebase-init.js';
import { translationService } from "./translation-service.js";
import { showToast } from "../utils.js";

// --- STATE MANAGEMENT ---
let selectedFiles = [];

export function clearSelectedFiles() { selectedFiles = []; }
export function getSelectedFiles() { return [...selectedFiles]; }

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

export function addSelectedFile(fileData) {
    if (!fileData || !fileData.fullPath) return;
    if (!selectedFiles.some(f => f.fullPath === fileData.fullPath)) {
        selectedFiles.push(fileData);
    }
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

// SECURITY FIX: Explicit Owner ID Filter
export async function renderMediaLibraryFiles(courseId, listElementId) {
    const listEl = document.getElementById(listElementId);
    if (!listEl) return;
    listEl.innerHTML = `<p class="text-slate-500 text-sm">${translationService.t('common.library_loading')}</p>`;

    try {
        const user = auth.currentUser;
        if (!user) {
            listEl.innerHTML = `<p class="text-red-500 text-sm">${translationService.t('common.library_login_required')}</p>`;
            return;
        }

        // SECURE QUERY: Only own files, ordered by date. Ignores courseId argument securely.
        const q = query(
            collection(db, 'fileMetadata'),
            where('ownerId', '==', user.uid),
            orderBy('createdAt', 'desc')
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            listEl.innerHTML = `<p class="text-slate-500 text-sm">${translationService.t('common.library_empty')}</p>`;
            return;
        }

        let allFiles = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return { name: data.fileName, fullPath: data.storagePath, id: doc.id };
        });

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
            checkbox.dataset.id = file.id;
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

    const fileData = {
        name: checkbox.dataset.filename,
        fullPath: rawPath,
        id: checkbox.dataset.id
    };

    if (checkbox.checked) {
        if (!selectedFiles.some(f => f.fullPath === fileData.fullPath)) selectedFiles.push(fileData);
    } else {
        selectedFiles = selectedFiles.filter(f => f.fullPath !== fileData.fullPath);
    }
    console.log("Selected RAG files:", selectedFiles);
}

// --- UPLOAD FUNCTIONS ---

export async function uploadMultipleFiles(files, courseId, onProgress) {
    const successful = [];
    const failed = [];

    for (const file of files) {
        try {
            const result = await uploadSingleFile(file, courseId, onProgress);
            successful.push(result);
        } catch (error) {
            console.error(`Failed to upload ${file.name}:`, error);
            failed.push({ file, error });
        }
    }

    return { successful, failed };
}

export async function uploadSingleFile(file, courseId, onProgress) {
    // 1. Get Secure Upload URL (and create metadata doc)
    const getSecureUploadUrl = httpsCallable(functions, 'getSecureUploadUrl');

    const { data } = await getSecureUploadUrl({
        fileName: file.name,
        contentType: file.type,
        courseId: courseId, // Metadata
        size: file.size // Include file size for Firestore metadata
    });

    // Handle variable name differences between backend and frontend expectation
    const uploadUrl = data.uploadUrl || data.signedUrl;
    const fileId = data.docId || data.fileId;
    const storagePath = data.filePath || data.storagePath;

    // 2. Upload to Storage via PUT to signed URL
    await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Check if using emulator (localhost or 127.0.0.1)
        const isEmulator = uploadUrl.includes("127.0.0.1") || uploadUrl.includes("localhost");
        const method = isEmulator ? 'POST' : 'PUT';

        xhr.open(method, uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);

        // Inject auth header for emulator to satisfy storage rules
        if (isEmulator && auth.currentUser) {
           auth.currentUser.getIdToken().then(token => {
               xhr.setRequestHeader('Authorization', `Firebase ${token}`);
               xhr.send(file);
           }).catch(err => {
               console.error("Failed to get token for emulator upload", err);
               reject(err);
           });
           // Return here because we send inside the async callback
           return;
        }

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
                const percent = (e.loaded / e.total) * 100;
                onProgress(percent);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                reject(new Error(`Upload failed with status ${xhr.status}`));
            }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));

        if (!isEmulator) {
            xhr.send(file);
        }
    });

    // 3. Finalize Upload (notify backend to update metadata)
    const finalizeUpload = httpsCallable(functions, 'finalizeUpload');
    // Backend expects docId and filePath
    await finalizeUpload({ docId: fileId, filePath: storagePath });

    // Return info needed for UI
    return {
        fileId,
        fileName: file.name,
        storagePath,
        url: uploadUrl.split('?')[0] // Approximation, or we fetch a read-URL later
    };
}

export async function processFileForRAG(fileId) {
    const processFunc = httpsCallable(functions, 'processFileForRAG');
    const result = await processFunc({ fileId });
    return result.data;
}

// UI Helper for course media upload (Ported from legacy just in case)
export function initializeCourseMediaUpload(courseId, onUploadCompleteCallback = null, containerElement = document) {
    const uploadArea = containerElement.querySelector('#course-media-upload-area');
    const fileInput = containerElement.querySelector('#course-media-file-input');
    // const mediaList = containerElement.querySelector('#course-media-list-container'); // Not used in new logic
    const progressContainer = containerElement.querySelector('#upload-progress-container');

    if (!uploadArea || !fileInput) return;

    uploadArea.addEventListener('click', (e) => {
        if (e.target === uploadArea || e.target.classList.contains('pointer-events-none') || e.target.closest('.pointer-events-none')) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (e) => {
        handleFileUploadAdaptor(e.target.files, courseId, progressContainer, onUploadCompleteCallback);
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
            handleFileUploadAdaptor(e.dataTransfer.files, courseId, progressContainer, onUploadCompleteCallback);
        }
    });
}

// Adaptor to use new uploadMultipleFiles with legacy UI elements
async function handleFileUploadAdaptor(files, courseId, progressContainer, onCompleteCallback) {
     if (!files || files.length === 0) return;

     if (progressContainer) {
         progressContainer.classList.remove('hidden');
         progressContainer.innerHTML = '<div class="text-xs text-slate-500">Uploading...</div>';
     }

     try {
         await uploadMultipleFiles(files, courseId, (progress) => {
             if (progressContainer) {
                 progressContainer.innerHTML = `<div class="w-full bg-slate-200 rounded-full h-1.5"><div class="bg-blue-600 h-1.5 rounded-full" style="width: ${progress}%"></div></div>`;
             }
         });
         showToast(translationService.t('common.upload_success_all'));
         if (onCompleteCallback) onCompleteCallback();
     } catch (e) {
         console.error(e);
         showToast(translationService.t('common.upload_error'), true);
     } finally {
         setTimeout(() => {
             if (progressContainer) progressContainer.classList.add('hidden');
         }, 2000);
     }
}
