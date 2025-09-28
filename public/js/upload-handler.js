import { getFirestore, collection, getDocs, query, orderBy, doc, addDoc, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, deleteObject, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

export function initializeUpload(lesson, db, storage) {
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-upload-input');

    if (!lesson || !lesson.id) {
        uploadZone.innerHTML = `<p class="font-semibold text-amber-600">Nejdříve prosím uložte detaily lekce, abyste mohli nahrávat soubory.</p>`;
        uploadZone.style.cursor = 'not-allowed';
        return;
    }

    const handleFiles = async (files) => {
        for (const file of files) {
            await uploadFile(file, lesson, db, storage);
        }
        await fetchAndRenderDocuments(lesson, db, storage);
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

    fetchAndRenderDocuments(lesson, db, storage);
}

async function uploadFile(file, lesson, db, storage) {
    const progressContainer = document.getElementById('upload-progress');
    const tempId = `file-${Date.now()}`;
    progressContainer.innerHTML += `<div id="${tempId}" class="text-sm text-slate-600">Nahrávám: ${file.name}...</div>`;

    try {
        const storageRef = ref(storage, `lessons/${lesson.id}/${file.name}`);
        await uploadBytes(storageRef, file);
        
        await addDoc(collection(db, "lessons", lesson.id, "documents"), {
            fileName: file.name,
            storagePath: storageRef.fullPath,
            uploadedAt: serverTimestamp(),
        });
        
        document.getElementById(tempId).remove();
    } catch (error) {
        console.error("Chyba při nahrávání:", error);
        document.getElementById(tempId).textContent = `Chyba při nahrávání ${file.name}.`;
    }
}

async function fetchAndRenderDocuments(lesson, db, storage) {
    const listElement = document.getElementById('documents-list');
    listElement.innerHTML = '<li>Načítám...</li>';

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
                await deleteDocument(e.target.dataset.docId, e.target.dataset.path, lesson, db, storage);
            }
        });
    });
}

async function deleteDocument(docId, storagePath, lesson, db, storage) {
    try {
        await deleteDoc(doc(db, "lessons", lesson.id, "documents", docId));
        await deleteObject(ref(storage, storagePath));
        await fetchAndRenderDocuments(lesson, db, storage);
    } catch (error) {
        console.error("Chyba při mazání:", error);
        alert("Nepodařilo se smazat soubor.");
    }
}