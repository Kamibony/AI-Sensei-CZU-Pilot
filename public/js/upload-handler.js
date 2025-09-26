// Import necessary modules from Firebase SDK
import { collection, getDocs, query, orderBy, doc, addDoc, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, deleteObject, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// Function to initialize the entire upload logic
export function initializeUpload(lesson, db, storage) {
    setupUploadFunctionality(lesson, db, storage);
    fetchAndRenderDocuments(lesson, db, storage);
}

function setupUploadFunctionality(lesson, db, storage) {
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-upload-input');

    if (!lesson) {
        // Safely find the label by its 'for' attribute and modify its content.
        const label = document.querySelector('label[for="file-upload-input"]');
        if(label) {
            label.innerHTML = `<p class="font-semibold text-amber-600">Please save the lesson details first to enable file uploads.</p>`;
            label.style.cursor = 'not-allowed';
        }
        return;
    }
    
    // Asynchronous function for handling file uploads
    const handleFiles = async (files) => {
        if (!files || files.length === 0) return;
        for (const file of files) {
            await uploadFile(file, lesson, db, storage);
        }
    };
    
    // Process files after selection
    fileInput.onchange = (e) => {
        const filesToUpload = e.target.files;
        if (!filesToUpload || filesToUpload.length === 0) {
            return;
        }
        // Start the upload in the background
        handleFiles(filesToUpload);
        // IMMEDIATELY reset the input value to be ready for the next selection
        e.target.value = "";
    };
    
    // Drag and drop functionality
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
    progressElement.innerHTML = `<p class="text-sm">Uploading: ${file.name}...</p><div class="w-full bg-slate-200 rounded-full h-2.5"><div class="bg-green-600 h-2.5 rounded-full" style="width: 100%"></div></div>`;
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
            successElement.innerHTML = `<p class="text-sm text-green-700">✓ File ${file.name} was successfully uploaded.</p>`;
            setTimeout(() => successElement.remove(), 3000);
        }
    } catch (error) {
         console.error("Error uploading file:", error);
         const errorElement = document.getElementById(fileId);
         if (errorElement) {
            errorElement.innerHTML = `<p class="text-sm text-red-700">✗ Error uploading file ${file.name}.</p>`;
         }
    } finally {
        await fetchAndRenderDocuments(lesson, db, storage);
    }
}

async function fetchAndRenderDocuments(lesson, db, storage) {
    if (!lesson?.id) return;
    const listElement = document.getElementById('documents-list');
    listElement.innerHTML = '<li class="text-center text-slate-400 text-sm">Loading documents...</li>';

    try {
        const q = query(collection(db, "lessons", lesson.id, "documents"), orderBy("uploadedAt", "desc"));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            listElement.innerHTML = '<li class="text-center text-slate-400 text-sm">No documents have been uploaded.</li>';
            return;
        }

        const docsHTML = querySnapshot.docs.map(docSnapshot => {
            const data = docSnapshot.data();
            return `<li class="flex items-center justify-between bg-slate-50 p-3 rounded-lg"><span class="flex items-center">📄<span class="ml-2 font-medium text-sm">${data.fileName}</span></span><button data-doc-id="${docSnapshot.id}" data-storage-path="${data.storagePath}" class="delete-doc-btn text-red-500 text-sm hover:underline">Delete</button></li>`;
        }).join('');
        listElement.innerHTML = docsHTML;
        
        listElement.querySelectorAll('.delete-doc-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const docId = e.target.dataset.docId;
                const storagePath = e.target.dataset.storagePath;
                if (confirm("Are you sure you want to delete the file?")) {
                    await deleteDocument(docId, storagePath, lesson, db, storage);
                }
            });
        });

    } catch (error) {
        console.error("Error loading documents:", error);
        listElement.innerHTML = '<li class="text-center text-red-600 text-sm">Failed to load documents.</li>';
    }
}

async function deleteDocument(docId, storagePath, lesson, db, storage) {
    if (!lesson?.id) return;
    try {
        await deleteDoc(doc(db, "lessons", lesson.id, "documents", docId));
        const fileRef = ref(storage, storagePath);
        await deleteObject(fileRef);
        alert("File was successfully deleted.");
        await fetchAndRenderDocuments(lesson, db, storage);
    } catch (error) {
        console.error("Error deleting file:", error);
        alert("Failed to delete file.");
    }
}