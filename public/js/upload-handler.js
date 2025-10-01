// Import shared services from our central init module
import { db, storage } from './firebase-init.js';

// Import specific functions we need from the SDKs
import { collection, getDocs, query, orderBy, doc, addDoc, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, deleteObject, listAll, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// The function no longer needs db and storage passed in, as it imports them directly.
export function initializeUpload(lesson) {
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-upload-input');

    if (!lesson || !lesson.id) {
        uploadZone.innerHTML = `<p class="font-semibold text-amber-600">Nejdříve prosím uložte detaily lekce, abyste mohli nahrávat soubory.</p>`;
        uploadZone.style.cursor = 'not-allowed';
        return;
    }

    const handleFiles = async (files) => {
        for (const file of files) {
            // Pass lesson only, as db and storage are now in the module's scope
            await uploadFile(file, lesson);
        }
        // Pass lesson only
        await fetchAndRenderDocuments(lesson);
    };

    uploadZone.onclick = () => fileInput.click();
    fileInput.onchange = (e) => handleFiles(e.target.files);
    
    uploadZone.ondragover = (e) => { e.preventDefault(); uploadZone.classList.add('drag-over-file'); };
    uploadZone.ondragleave = () => uploadZone.classList.remove('drag-over-file');
    uploadZone.ondrop = (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over-file');
        handleFiles(e.dataTransfer.files);
    };

    fetchAndRenderDocuments(lesson);
}

async function uploadFile(file, lesson) {
    const progressContainer = document.getElementById('upload-progress');
    const tempId = `file-${Date.now()}`;
    progressContainer.innerHTML += `<div id="${tempId}" class="text-sm text-slate-600">Nahrávám: ${file.name}...</div>`;

    try {
        // Use the imported, shared storage and db instances
        const storageRef = ref(storage, `lessons/${lesson.id}/${file.name}`);
        await uploadBytes(storageRef, file);
        
        await addDoc(collection(db, "lessons", lesson.id, "documents"), {
            fileName: file.name,
            storagePath: storageRef.fullPath,
            uploadedAt: serverTimestamp(),
        });
        
        document.getElementById(tempId).remove();
    } catch (error) {
        console.error("Chyba při nahrávání souboru:", error);
        document.getElementById(tempId).textContent = `Chyba při nahrávání ${file.name}. Zkontrolujte konzoli pro detaily.`;
        document.getElementById(tempId).classList.add('text-red-600');
    }
}

async function fetchAndRenderDocuments(lesson) {
    const listElement = document.getElementById('documents-list');
    listElement.innerHTML = '<li>Načítám...</li>';

    try {
        // Use the imported, shared db instance
        const q = query(collection(db, "lessons", lesson.id, "documents"), orderBy("uploadedAt", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            listElement.innerHTML = '<li>Žádné soubory nebyly nahrány.</li>';
            return;
        }

        listElement.innerHTML = querySnapshot.docs.map(docSnapshot => {
            const data = docSnapshot.data();
            return `<li class="flex items-center justify-between bg-slate-50 p-3 rounded-lg">
                        <span>📄 ${data.fileName}</span>
                        <button data-doc-id="${docSnapshot.id}" data-path="${data.storagePath}" class="delete-doc-btn text-red-500 hover:underline text-sm">Smazat</button>
                    </li>`;
        }).join('');

        listElement.querySelectorAll('.delete-doc-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (confirm('Opravdu smazat soubor?')) {
                    // Pass lesson only
                    await deleteDocument(e.target.dataset.docId, e.target.dataset.path, lesson);
                }
            });
        });
    } catch (error) {
        console.error("Chyba při načítání dokumentů:", error);
        listElement.innerHTML = '<li>Chyba při načítání dokumentů.</li>';
    }
}

async function deleteDocument(docId, storagePath, lesson) {
    try {
        // Use imported, shared db and storage instances
        await deleteDoc(doc(db, "lessons", lesson.id, "documents", docId));
        await deleteObject(ref(storage, storagePath));
        await fetchAndRenderDocuments(lesson);
    } catch (error) {
        console.error("Chyba při mazání souboru:", error);
        alert("Nepodařilo se smazat soubor.");
    }
}

// --- NEW FUNCTION FOR GENERAL COURSE MEDIA ---
export function initializeCourseMediaUpload(courseId) {
    const uploadArea = document.getElementById('course-media-upload-area');
    const fileInput = document.getElementById('course-media-file-input');
    const mediaList = document.getElementById('course-media-list');

    if (!uploadArea || !fileInput || !mediaList) {
        console.error('Required elements for course media upload are missing.');
        return;
    }

    const handleFiles = async (files) => {
        for (const file of files) {
            await uploadCourseFile(file, courseId);
        }
        // After uploads are done, refresh the list.
        await renderMediaLibraryFiles(courseId);
    };

    uploadArea.onclick = () => fileInput.click();
    fileInput.onchange = (e) => handleFiles(e.target.files);

    uploadArea.ondragover = (e) => { e.preventDefault(); uploadArea.classList.add('drag-over-file'); };
    uploadArea.ondragleave = () => uploadArea.classList.remove('drag-over-file');
    uploadArea.ondrop = (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over-file');
        handleFiles(e.dataTransfer.files);
    };

    // The initial render is now triggered from main.js
}

async function uploadCourseFile(file, courseId) {
    const mediaList = document.getElementById('course-media-list');
    const tempId = `file-progress-${Date.now()}`;
    // Use a temporary list item for upload progress
    const progressItem = document.createElement('li');
    progressItem.id = tempId;
    progressItem.textContent = `Nahrávám: ${file.name}...`;
    progressItem.className = 'text-sm text-slate-600 p-2';
    mediaList.appendChild(progressItem);

    try {
        const storageRef = ref(storage, `courses/${courseId}/media/${file.name}`);
        await uploadBytes(storageRef, file);
        // Remove the progress indicator on success. The list will be refreshed.
        progressItem.remove();
    } catch (error) {
        console.error("Chyba při nahrávání souboru kurzu:", error);
        const errorItem = document.getElementById(tempId);
        if (errorItem) {
            errorItem.textContent = `Chyba při nahrávání ${file.name}.`;
            errorItem.classList.add('text-red-600');
        }
    }
}

export async function renderMediaLibraryFiles(courseId) {
    const mediaList = document.getElementById('course-media-list');
    if (!mediaList) return;

    mediaList.innerHTML = '<li class="p-2 text-slate-500">Načítám soubory...</li>';

    try {
        const listRef = ref(storage, `courses/${courseId}/media`);
        const res = await listAll(listRef);

        if (res.items.length === 0) {
            mediaList.innerHTML = '<li class="p-2 text-slate-500">Knihovna médií je prázdná.</li>';
            return;
        }

        mediaList.innerHTML = ''; // Clear loading message

        for (const itemRef of res.items) {
            const url = await getDownloadURL(itemRef);
            const listItem = document.createElement('li');
            listItem.className = 'flex items-center justify-between bg-slate-50 p-3 rounded-lg';
            listItem.innerHTML = `
                <a href="${url}" target="_blank" class="text-green-700 hover:underline flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    <span>${itemRef.name}</span>
                </a>
                <button data-path="${itemRef.fullPath}" class="delete-media-btn text-red-500 hover:underline text-sm">Smazat</button>
            `;
            mediaList.appendChild(listItem);
        }

        // Add event listeners to the new delete buttons
        mediaList.querySelectorAll('.delete-media-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const filePath = e.target.dataset.path;
                if (confirm(`Opravdu chcete smazat soubor: ${filePath.split('/').pop()}?`)) {
                    try {
                        await deleteObject(ref(storage, filePath));
                        await renderMediaLibraryFiles(courseId); // Refresh list after deleting
                    } catch (error) {
                        console.error("Chyba při mazání souboru z médií:", error);
                        alert("Nepodařilo se smazat soubor.");
                    }
                }
            });
        });

    } catch (error) {
        console.error("Chyba při načítání souborů z knihovny médií:", error);
        mediaList.innerHTML = '<li class="p-2 text-red-500">Chyba při načítání souborů.</li>';
    }
}