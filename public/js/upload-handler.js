// public/js/upload-handler.js

import { getStorage, ref, uploadBytesResumable, getDownloadURL, listAll, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { showToast } from './utils.js';
import { db } from './firebase-init.js';
import { collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const storage = getStorage();

export function initializeMediaUpload(courseId, fileInputId, dropAreaId, fileListId) {
    const fileInput = document.getElementById(fileInputId);
    const dropArea = document.getElementById(dropAreaId);

    if (!fileInput || !dropArea) return;

    const openFileDialog = () => fileInput.click();
    dropArea.addEventListener('click', openFileDialog);

    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('bg-green-50', 'border-green-400');
    });

    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('bg-green-50', 'border-green-400');
    });

    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('bg-green-50', 'border-green-400');
        const files = e.dataTransfer.files;
        if (files.length) {
            handleFiles(files, courseId, fileListId);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFiles(e.target.files, courseId, fileListId);
        }
    });
}

function handleFiles(files, courseId, fileListId) {
    [...files].forEach(file => {
        if (file.type !== 'application/pdf') {
            showToast(`Soubor ${file.name} není PDF a bude přeskočen.`, true);
            return;
        }
        uploadFile(file, courseId, fileListId);
    });
}

function uploadFile(file, courseId, fileListId) {
    const storageRef = ref(storage, `courses/${courseId}/${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    const fileListContainer = document.getElementById(fileListId);
    const listItem = document.createElement('li');
    listItem.className = 'bg-slate-50 p-3 rounded-lg flex items-center justify-between';
    listItem.innerHTML = `
        <div class="flex items-center space-x-3">
            <span class="text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></span>
            <span class="font-semibold text-slate-700 text-sm">${file.name}</span>
        </div>
        <div class="upload-progress-bar w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div class="progress h-full bg-green-500 transition-all duration-300" style="width: 0%;"></div>
        </div>
    `;
    fileListContainer.appendChild(listItem);

    uploadTask.on('state_changed',
        (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            listItem.querySelector('.progress').style.width = `${progress}%`;
        },
        (error) => {
            console.error("Upload failed:", error);
            showToast(`Nahrávání souboru ${file.name} selhalo.`, true);
            listItem.remove();
        },
        () => {
            getDownloadURL(uploadTask.snapshot.ref).then(async (downloadURL) => {
                await addDoc(collection(db, "media"), {
                    courseId: courseId,
                    fileName: file.name,
                    url: downloadURL,
                    storagePath: uploadTask.snapshot.ref.fullPath,
                    createdAt: serverTimestamp()
                });
                showToast(`Soubor ${file.name} byl úspěšně nahrán.`);
                listItem.querySelector('.upload-progress-bar').innerHTML = `<span class="text-xs font-semibold text-green-600">Hotovo</span>`;
                setTimeout(() => renderMediaFiles(courseId, fileListId), 1000);
            });
        }
    );
}

export async function renderMediaFiles(courseId, fileListId) {
    const listContainer = document.getElementById(fileListId);
    if (!listContainer) return;
    
    listContainer.innerHTML = '<p class="text-center text-slate-400 p-4">Načítám soubory...</p>';

    try {
        const q = query(collection(db, "media"), where("courseId", "==", courseId));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            listContainer.innerHTML = '<p class="text-center text-slate-400 p-4">Zatím nebyly nahrány žádné soubory.</p>';
            return;
        }

        listContainer.innerHTML = '';
        querySnapshot.forEach(docSnap => {
            const fileData = docSnap.data();
            const listItem = document.createElement('li');
            listItem.className = 'bg-slate-50 p-3 rounded-lg flex items-center justify-between group';
            listItem.innerHTML = `
                <div class="flex items-center space-x-3">
                    <span class="text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></span>
                    <a href="${fileData.url}" target="_blank" class="font-semibold text-slate-700 text-sm hover:underline">${fileData.fileName}</a>
                </div>
                <button class="delete-media-btn p-1 rounded-full text-slate-400 hover:bg-red-200 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" data-doc-id="${docSnap.id}" data-storage-path="${fileData.storagePath}" title="Smazat soubor">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            `;
            listContainer.appendChild(listItem);
        });

        listContainer.querySelectorAll('.delete-media-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const docId = e.currentTarget.dataset.docId;
                const storagePath = e.currentTarget.dataset.storagePath;
                if (confirm('Opravdu chcete tento soubor smazat?')) {
                    try {
                        // Delete from Storage
                        const fileRef = ref(storage, storagePath);
                        await deleteObject(fileRef);
                        
                        // Delete from Firestore
                        await deleteDoc(doc(db, "media", docId));
                        
                        showToast('Soubor byl úspěšně smazán.');
                        renderMediaFiles(courseId, fileListId);
                    } catch (error) {
                        console.error("Error deleting file:", error);
                        showToast('Chyba při mazání souboru.', true);
                    }
                }
            });
        });

    } catch (error) {
        console.error("Error fetching media files: ", error);
        listContainer.innerHTML = '<p class="text-center text-red-500 p-4">Nepodařilo se načíst soubory.</p>';
    }
}
