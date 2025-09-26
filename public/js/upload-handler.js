// Import potřebných modulů z Firebase SDK
import { getFirestore, collection, getDocs, query, orderBy, doc, addDoc, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// Funkce pro inicializaci celé logiky nahrávání
export function initializeUpload(lesson, db, storage) {
    setupUploadFunctionality(lesson, db, storage);
    fetchAndRenderDocuments(lesson, db, storage);
}

function setupUploadFunctionality(lesson, db, storage) {
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-upload-input');

    if (!lesson) {
        // Nyní bezpečně najdeme label podle `for` atributu a upravíme jeho obsah.
        const label = document.querySelector('label[for="file-upload-input"]');
        if(label) {
            label.innerHTML = `<p class="font-semibold text-amber-600">Nejdříve prosím uložte detaily lekce, abyste mohli nahrávat soubory.</p>`;
            label.style.cursor = 'not-allowed';
        }
        return;
    }
    
    // Asynchronní funkce pro samotné nahrávání souborů
    const handleFiles = async (files) => {
        if (!files || files.length === 0) return;
        for (const file of files) {
            await uploadFile(file, lesson, db, storage);
        }
    };
    
    // Zpracování po výběru souborů
    fileInput.onchange = (e) => {
        const filesToUpload = e.target.files;
        if (!filesToUpload || filesToUpload.length === 0) {
            return;
        }
        // Spustíme nahrávání na pozadí
        handleFiles(filesToUpload);
        // OKAMŽITĚ resetujeme hodnotu inputu, aby byl připraven na další výběr
        e.target.value = "";
    };
    
    // Funkce pro drag and drop
    uploadZone.ondragover = (e) => { e.preventDefault(); uploadZone.classList.add('drag-over-file'); };
    uploadZone.ondragleave = () => uploadZone.classList.remove('drag-over-file');
    uploadZone.ondrop = (e) => { 
        e.preventDefault(); 
        uploadZone.classList.remove('drag-over-file'); 
        const filesToUpload = e.dataTransfer.files;
        if (filesToUpload) {
            handleFiles(filesToUpload);
        }
    };
}

async function uploadFile(file, lesson, db, storage) {
    if (!lesson?.id) return;
    const progressContainer = document.getElementById('upload-progress');
    const fileId = `file-${Date.now()}-${Math.random()}`;
    const progressElement = document.createElement('div');
    progressElement.id = fileId;
    progressElement.innerHTML = `<p class="text-sm">Nahrávám: ${file.name}...</p><div class="w-full bg-slate-200 rounded-full h-2.5"><div class="bg-green-600 h-2.5 rounded-full" style="width: 100%"></div></div>`;
    progressContainer.appendChild(progressElement);

    try {
        const storageRef = ref(storage, `lessons/${lesson.id}/${file.name}`);
        await uploadBytes(storageRef, file);
        
        const docsCollectionRef = collection(db, "lessons", lesson.id, "documents");
        await addDoc(docsCollectionRef, {
            fileName: file.name,
            storagePath: storageRef.fullPath,
            uploadedAt: serverTimestamp(),
        });
        
        const successElement = document.getElementById(fileId);
        if (successElement) {
            successElement.innerHTML = `<p class="text-sm text-green-700">✓ Soubor ${file.name} byl úspěšně nahrán.</p>`;
            setTimeout(() => successElement.remove(), 3000);
        }
    } catch (error) {
         console.error("Chyba při nahrávání souboru:", error);
         const errorElement = document.getElementById(fileId);
         if (errorElement) {
            errorElement.innerHTML = `<p class="text-sm text-red-700">✗ Chyba při nahrávání souboru ${file.name}.</p>`;
         }
    } finally {
        await fetchAndRenderDocuments(lesson, db, storage);
    }
}

async function fetchAndRenderDocuments(lesson, db, storage) {
    if (!lesson?.id) return;
    const listElement = document.getElementById('documents-list');
    listElement.innerHTML = '<li class="text-center text-slate-400 text-sm">Načítám dokumenty...</li>';

    try {
        const q = query(collection(db, "lessons", lesson.id, "documents"), orderBy("uploadedAt", "desc"));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            listElement.innerHTML = '<li class="text-center text-slate-400 text-sm">Žádné dokumenty nebyly nahrány.</li>';
            return;
        }

        const docsHTML = querySnapshot.docs.map(docSnapshot => {
            const data = docSnapshot.data();
            return `<li class="flex items-center justify-between bg-slate-50 p-3 rounded-lg"><span class="flex items-center">📄<span class="ml-2 font-medium text-sm">${data.fileName}</span></span><button data-doc-id="${docSnapshot.id}" data-storage-path="${data.storagePath}" class="delete-doc-btn text-red-500 text-sm hover:underline">Odstranit</button></li>`;
        }).join('');
        listElement.innerHTML = docsHTML;
        
        listElement.querySelectorAll('.delete-doc-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const docId = e.target.dataset.docId;
                const storagePath = e.target.dataset.storagePath;
                if (confirm(`Opravdu chcete smazat soubor?`)) {
                    await deleteDocument(docId, storagePath, lesson, db, storage);
                }
            });
        });

    } catch (error) {
        console.error("Chyba při načítání dokumentů:", error);
        listElement.innerHTML = '<li class="text-center text-red-600 text-sm">Nepodařilo se načíst dokumenty.</li>';
    }
}

async function deleteDocument(docId, storagePath, lesson, db, storage) {
    if (!lesson?.id) return;
    try {
        await deleteDoc(doc(db, "lessons", lesson.id, "documents", docId));
        const fileRef = ref(storage, storagePath);
        await deleteObject(fileRef);
        alert("Soubor byl úspěšně smazán.");
        await fetchAndRenderDocuments(lesson, db, storage);
    } catch (error) {
        console.error("Chyba při mazání souboru:", error);
        alert("Nepodařilo se smazat soubor.");
    }
}