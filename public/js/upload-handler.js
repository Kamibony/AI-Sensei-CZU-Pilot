import { storage } from './firebase-init.js';
import { ref, uploadBytes, deleteObject, listAll, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// --- Funkcie pre správu médií kurzu ---
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
        await renderMediaLibraryFiles(courseId);
    };

    uploadArea.onclick = () => fileInput.click();
    fileInput.onchange = (e) => handleFiles(e.target.files);

    uploadArea.ondragover = (e) => { e.preventDefault(); uploadArea.classList.add('bg-green-100', 'border-green-400'); };
    uploadArea.ondragleave = () => uploadArea.classList.remove('bg-green-100', 'border-green-400');
    uploadArea.ondrop = (e) => {
        e.preventDefault();
        uploadArea.classList.remove('bg-green-100', 'border-green-400');
        handleFiles(e.dataTransfer.files);
    };
}

async function uploadCourseFile(file, courseId) {
    const mediaList = document.getElementById('course-media-list');
    const tempId = `file-progress-${Date.now()}`;
    const progressItem = document.createElement('li');
    progressItem.id = tempId;
    progressItem.textContent = `Nahrávám: ${file.name}...`;
    progressItem.className = 'text-sm text-slate-600 p-2';
    mediaList.appendChild(progressItem);

    try {
        const storageRef = ref(storage, `courses/${courseId}/media/${file.name}`);
        await uploadBytes(storageRef, file);
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

        mediaList.innerHTML = ''; 

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

        mediaList.querySelectorAll('.delete-media-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const filePath = e.target.dataset.path;
                if (confirm(`Opravdu chcete smazat soubor: ${filePath.split('/').pop()}?`)) {
                    try {
                        await deleteObject(ref(storage, filePath));
                        await renderMediaLibraryFiles(courseId);
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
