// public/js/upload-handler.js
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { collection, addDoc, serverTimestamp, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from './firebase-init.js';
import { showToast } from "./utils.js";

// Funkcia na spracovanie nahrávania súborov (Bulk upload)
async function handleFileUpload(files, courseId, progressContainer, mediaListContainer, onCompleteCallback) {
    if (!files || files.length === 0) return;
    if (!progressContainer) {
        // console.error("Progress container not found for uploads.");
    } else {
         progressContainer.classList.remove('hidden');
         progressContainer.innerHTML = ''; // Vyčistíme staré progressy
    }

    const storage = getStorage(firebaseInit.app);
    const uploadPromises = [];

    Array.from(files).forEach(file => {
        if (file.type !== 'application/pdf') {
            showToast(`Soubor ${file.name} není PDF a bude přeskočen.`, true);
            return;
        }

        const user = firebaseInit.auth.currentUser;
        if (!user) {
            showToast(`Nejste přihlášen. Nahrávání bylo zrušeno.`, true);
            return;
        }

        const metadata = {
            customMetadata: {
                'ownerId': user.uid
            }
        };

        const storageRef = ref(storage, `courses/${courseId}/media/${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file, metadata);

        let progressElement = null;
        let progressBar = null;
        if (progressContainer) {
             progressElement = document.createElement('div');
             progressElement.className = 'upload-progress-item p-2 bg-slate-100 rounded';
             progressElement.innerHTML = `
                 <div class="flex justify-between items-center text-xs mb-1">
                     <span class="font-medium text-slate-700 truncate pr-2">${file.name}</span>
                     <span class="percentage text-slate-500">0%</span>
                 </div>
                 <div class="w-full bg-slate-200 rounded-full h-1.5">
                     <div class="progress-bar bg-green-600 h-1.5 rounded-full" style="width: 0%"></div>
                 </div>
             `;
             progressContainer.appendChild(progressElement);
             progressBar = progressElement.querySelector('.progress-bar');
        }

        const promise = new Promise((resolve, reject) => {
            uploadTask.on('state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    console.log(`Upload ${file.name} is ${progress}% done`);
                    if (progressBar && progressElement) {
                        progressBar.style.width = progress + '%';
                        progressElement.querySelector('.percentage').textContent = Math.round(progress) + '%';
                    }
                },
                (error) => {
                    console.error(`Upload ${file.name} failed:`, error);
                    showToast(`Nahrávání souboru ${file.name} selhalo.`, true);
                     if (progressElement) {
                        progressElement.classList.add('bg-red-100');
                        progressElement.querySelector('.percentage').textContent = 'Chyba!';
                        setTimeout(() => progressElement?.remove(), 5000);
                     }
                    reject(error);
                },
                async () => {
                    console.log(`Upload ${file.name} complete.`);
                    // Dvojitý zápis: Po úspešnom nahratí do Storage, vytvoríme záznam vo Firestore
                    try {
                        const uploadResult = uploadTask.snapshot;
                        await addDoc(collection(firebaseInit.db, "fileMetadata"), {
                            storagePath: uploadResult.ref.fullPath,
                            fileName: uploadResult.metadata.name,
                            ownerId: user.uid,
                            courseId: courseId,
                            createdAt: serverTimestamp(),
                            size: uploadResult.metadata.size,
                            contentType: uploadResult.metadata.contentType
                        });
                    } catch (firestoreError) {
                        console.error("Error creating file metadata in Firestore:", firestoreError);
                        // TODO: Zvážiť logiku pre rollback - zmazanie súboru zo Storage, ak zápis do DB zlyhá
                        showToast(`Soubor ${file.name} byl nahrán, ale nepodařilo se vytvořit záznam v databázi.`, true);
                    }

                    if (progressElement) {
                         progressBar.style.width = '100%';
                         progressElement.querySelector('.percentage').textContent = '100%';
                         setTimeout(() => progressElement?.remove(), 1500);
                    }
                    resolve();
                }
            );
        });
        uploadPromises.push(promise);
    });

    try {
        await Promise.all(uploadPromises);
        showToast("Všechny vybrané PDF soubory byly nahrány.");
        if (onCompleteCallback) onCompleteCallback();
    } catch (error) {
        console.error("Some uploads failed.", error);
        showToast("Některé soubory se nepodařilo nahrát.", true);
         if (onCompleteCallback) onCompleteCallback();
    } finally {
         setTimeout(() => {
             if (progressContainer && progressContainer.children.length === 0) {
                 progressContainer.classList.add('hidden');
             }
         }, 2000);
    }
}

// --- RAG Global State ---
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

export function renderSelectedFiles(listElementId = "selected-files-list-rag") {
    const listEl = document.getElementById(listElementId);
    if (!listEl) return;

    if (selectedFiles.length === 0) {
        listEl.innerHTML = '<li>Žádné soubory nevybrány.</li>';
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
    listEl.innerHTML = '<p class="text-slate-500 text-sm">Načítám soubory...</p>';

    try {
        const user = firebaseInit.auth.currentUser;
        if (!user) {
            listEl.innerHTML = '<p class="text-red-500 text-sm">Nejste přihlášen.</p>';
            return;
        }

        // Nahradenie listAll() za Firestore query
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
            listEl.innerHTML = '<p class="text-slate-500 text-sm">V knihovně nejsou žádné soubory.</p>';
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
        listEl.innerHTML = '<p class="text-red-500 text-sm">Nepodařilo se načíst soubory.</p>';
    }
}

function handleCheckboxChange(e) {
    const checkbox = e.target;
    const fileData = { name: checkbox.dataset.filename, fullPath: checkbox.dataset.fullpath };
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

// === NOVÉ EXPORTY (OPRAVA CHYBY) ===

// Pridá súbor do zoznamu vybraných RAG súborov
export function addSelectedFile(fileData) {
    if (!fileData || !fileData.fullPath) return;
    // Zabránime duplicitám
    if (!selectedFiles.some(f => f.fullPath === fileData.fullPath)) {
        selectedFiles.push(fileData);
    }
}

// Spracuje inline upload jedného súboru (pre AI panel)
export function processAndStoreFile(file, courseId, userId, onProgress, onError, onSuccess) {
     const storage = getStorage(firebaseInit.app);
     // Ukladáme do rovnakej zložky ako bežné médiá kurzu
     const storageRef = ref(storage, `courses/${courseId}/media/${file.name}`);

     const metadata = {
        contentType: file.type,
        customMetadata: {
            'ownerId': userId
        }
     };

     const uploadTask = uploadBytesResumable(storageRef, file, metadata);

     uploadTask.on('state_changed',
        (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if (onProgress) onProgress(progress);
        },
        (error) => {
            if (onError) onError(error);
        },
        async () => {
            // Upload complete, now write to Firestore
            try {
                const uploadResult = uploadTask.snapshot;
                const docRef = await addDoc(collection(firebaseInit.db, "fileMetadata"), {
                    storagePath: uploadResult.ref.fullPath,
                    fileName: uploadResult.metadata.name,
                    ownerId: userId,
                    courseId: courseId,
                    createdAt: serverTimestamp(),
                    size: uploadResult.metadata.size,
                    contentType: uploadResult.metadata.contentType
                });

                const downloadURL = await getDownloadURL(uploadResult.ref);
                if (onSuccess) onSuccess(downloadURL, uploadResult.ref.fullPath);

            } catch (e) {
                 if (onError) onError(e);
            }
        }
    );
}
