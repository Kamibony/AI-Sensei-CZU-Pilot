// Import shared services from our central init module
import { db, storage } from './firebase-init.js';

// Import specific functions we need from the SDKs
import { collection, getDocs, query, orderBy, doc, addDoc, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

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