// Súbor: public/js/upload-handler.js
// Verzia: Plná (400+ riadkov)
import * as firebaseInit from './firebase-init.js'; // <-- OPRAVENÉ
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { showToast } from './utils.js'; // <-- OPRAVENÉ
import { 
    collection, 
    doc, 
    deleteDoc, 
    query, 
    orderBy, 
    onSnapshot, 
    addDoc, 
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

let uploaderProfessorId = null;
let allMediaData = [];
let mediaSelectionCallback = null; // Callback pro editor
let mediaListUnsubscribe = null;
let selectedMediaForEditor = []; // Seznam médií (objekty) aktuálně vybraných pro editor

/**
 * Inicializuje upload handler s ID profesora a daty.
 * @param {string} professorId 
 * @param {Array} mediaData - Všechna média
 */
export function initializeUploader(professorId, mediaData) {
    uploaderProfessorId = professorId;
    allMediaData = mediaData;
    
    // Připojení globálních funkcí k window
    window.openMediaUploaderModal = openMediaUploaderModal;
    // Toto je speciální callback pro Quill editor, když vloží obrázek
    window.handleQuillImageUpload = handleQuillImageUpload;
    // Toto volá editor, když chce nahrát média (např. video/prezentaci)
    window.initializeModalMediaUpload = initializeModalMediaUpload; 
}


// ==================================================================
// Správa modálního okna pro výběr médií (pro Editor Lekcí)
// ==================================================================

/**
 * Otevře modální okno pro nahrávání a výběr médií PRO EDITOR.
 * @param {function} onMediaSelected - Callback, který se zavolá po výběru/nahrání média.
 * @param {Array} currentlyAttachedMedia - Pole objektů médií, která jsou již připojena k lekci.
 */
function openMediaUploaderModal(onMediaSelected, currentlyAttachedMedia = []) {
    mediaSelectionCallback = onMediaSelected;
    // Nastavíme interní seznam vybraných médií podle toho, co už v lekci je
    selectedMediaForEditor = currentlyAttachedMedia.map(m => m.id); // Ukládáme jen ID
    
    const modal = document.getElementById('media-upload-modal');
    modal.innerHTML = `
        <div class="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-xl flex flex-col">
            <header class="p-4 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
                <h2 class="text-xl font-bold text-slate-800">Připojit média k lekci</h2>
                <button id="uploader-close-btn" class="text-slate-500 hover:text-slate-800 p-2 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </header>
            
            <div class="flex-grow flex flex-col md:flex-row overflow-y-auto">
                <div class="w-full md:w-1/3 p-4 border-b md:border-b-0 md:border-r border-slate-200 flex-shrink-0">
                    ${createUploadFormHTML('modal-upload')}
                </div>
                
                <div class="w-full md:w-2/3 p-4 overflow-y-auto flex-grow">
                    <h3 class="font-semibold text-slate-700 mb-3">Vybrat z knihovny</h3>
                    <div id="media-library-grid" class="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <p class="text-slate-500 col-span-full">Načítám média...</p>
                    </div>
                </div>
            </div>
            
             <footer class="p-4 border-t border-slate-200 flex-shrink-0 flex justify-end items-center bg-white rounded-b-2xl">
                 <button id="uploader-cancel-btn" class="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-200 mr-3">Zrušit</button>
                 <button id="uploader-confirm-selection-btn" class="px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800">
                    Potvrdit výběr
                 </button>
            </footer>
        </div>
    `;
    modal.classList.remove('hidden');

    // Navázání listenerů
    document.getElementById('uploader-close-btn').addEventListener('click', closeMediaUploaderModal);
    document.getElementById('uploader-cancel-btn').addEventListener('click', closeMediaUploaderModal);
    
    // Potvrzení výběru
    document.getElementById('uploader-confirm-selection-btn').addEventListener('click', () => {
        if (mediaSelectionCallback) {
            // Najdeme plné objekty médií podle ID
            const selectedMediaObjects = selectedMediaForEditor.map(id => 
                allMediaData.find(m => m.id === id)
            ).filter(Boolean); // Odfiltrujeme případné nenalezené
            
            mediaSelectionCallback(selectedMediaObjects);
        }
        closeMediaUploaderModal();
    });
    
    // Formulář pro nahrávání
    document.getElementById('modal-upload-form').addEventListener('submit', (e) => handleFileUpload(e, 'modal-upload'));
    document.getElementById('modal-upload-media-type').addEventListener('change', (e) => onMediaTypeChange(e, 'modal-upload'));
    
    // Načtení knihovny médií
    loadMediaLibrary('modal');
}

/**
 * Zavře modální okno správce médií.
 */
function closeMediaUploaderModal() {
    const modal = document.getElementById('media-upload-modal');
    modal.classList.add('hidden');
    modal.innerHTML = ''; // Vyčistit obsah
    mediaSelectionCallback = null;
    selectedMediaForEditor = [];
    if (mediaListUnsubscribe) {
        mediaListUnsubscribe();
        mediaListUnsubscribe = null;
    }
}

// ==================================================================
// Správa nahrávání (obecná logika)
// ==================================================================

/**
 * Vytvoří HTML pro nahrávací formulář.
 * @param {string} prefix - Unikátní prefix pro ID elementů (např. 'modal-upload' nebo 'media-view-upload')
 */
function createUploadFormHTML(prefix) {
    return `
        <h3 class="font-semibold text-slate-700 mb-3">Nahrát nový soubor</h3>
        <form id="${prefix}-form" class="space-y-3">
             <div>
                <label for="${prefix}-media-type" class="block text-sm font-medium text-slate-700 mb-1">Typ média</label>
                <select id="${prefix}-media-type" class="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm">
                    <option value="presentation">Prezentace (PDF)</option>
                    <option value="image">Obrázek (PNG, JPG)</option>
                    <option value="video">Video (YouTube odkaz)</option>
                    <option value="audio">Audio (MP3)</option>
                </select>
             </div>
             <div id="${prefix}-file-input-group">
                <label for="${prefix}-file-input" class="block text-sm font-medium text-slate-700 mb-1">Soubor</label>
                <input type="file" id="${prefix}-file-input" class="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100" required>
             </div>
             <div id="${prefix}-youtube-link-group" class="hidden">
                 <label for="${prefix}-youtube-link" class="block text-sm font-medium text-slate-700 mb-1">YouTube odkaz</label>
                 <input type="url" id="${prefix}-youtube-link" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" placeholder="https://www.youtube.com/watch?v=...">
             </div>
             <button type="submit" id="${prefix}-submit-btn" class="w-full px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 flex items-center justify-center min-h-[36px]">
                Nahrát
             </button>
             <div id="${prefix}-progress-bar" class="w-full bg-slate-200 rounded-full h-2.5 hidden">
                 <div class="bg-green-600 h-2.5 rounded-full" style="width: 0%"></div>
             </div>
        </form>
    `;
}

/**
 * Reaguje na změnu typu média ve formuláři.
 * @param {Event} e 
 * @param {string} prefix 
 */
function onMediaTypeChange(e, prefix) {
    const fileInputGroup = document.getElementById(`${prefix}-file-input-group`);
    const fileInput = document.getElementById(`${prefix}-file-input`);
    const youtubeGroup = document.getElementById(`${prefix}-youtube-link-group`);
    const youtubeInput = document.getElementById(`${prefix}-youtube-link`);
    
    if (e.target.value === 'video') {
        fileInputGroup.classList.add('hidden');
        fileInput.required = false;
        youtubeGroup.classList.remove('hidden');
        youtubeInput.required = true;
    } else {
        fileInputGroup.classList.remove('hidden');
        fileInput.required = true;
        youtubeGroup.classList.add('hidden');
        youtubeInput.required = false;
    }
}

/**
 * Zpracuje nahrání nového souboru nebo YouTube odkazu.
 * @param {Event} e 
 * @param {string} prefix
 */
async function handleFileUpload(e, prefix) {
    e.preventDefault();
    if (!uploaderProfessorId) {
        showToast("Chyba: Není nastaven profesor.", true);
        return;
    }
    
    const mediaType = document.getElementById(`${prefix}-media-type`).value;
    const uploadButton = document.getElementById(`${prefix}-submit-btn`);
    uploadButton.disabled = true;
    uploadButton.innerHTML = '<div class="spinner-small-white"></div>';

    try {
        const mediaCollectionRef = collection(db, 'professors', uploaderProfessorId, 'media');

        if (mediaType === 'video') {
            // Zpracování YouTube odkazu
            const youtubeLink = document.getElementById(`${prefix}-youtube-link`).value;
            if (!youtubeLink) {
                showToast("Zadejte platný YouTube odkaz.", true);
                return;
            }
            
            await addDoc(mediaCollectionRef, {
                type: 'video',
                url: youtubeLink,
                fileName: `YouTube Video: ${youtubeLink.substring(0, 30)}...`,
                professorId: uploaderProfessorId,
                uploadedAt: serverTimestamp()
            });
            showToast("Video odkaz úspěšně přidán.", false);

        } else {
            // Zpracování nahrávání souboru
            const fileInput = document.getElementById(`${prefix}-file-input`);
            const file = fileInput.files[0];
            if (!file) {
                showToast("Vyberte prosím soubor k nahrání.", true);
                return;
            }

            // 1. Zavoláme CF pro získání podepsané URL
            const uploadFileFunc = httpsCallable(firebaseInit.functions, 'uploadFile');
            const result = await uploadFileFunc({
                fileName: file.name,
                contentType: file.type,
                mediaType: mediaType
            });
            
            const { signedUrl, documentId } = result.data;

            // 2. Nahrání souboru přímo do GCS
            const progressBar = document.getElementById(`${prefix}-progress-bar`);
            progressBar.classList.remove('hidden');
            const progressBarInner = progressBar.querySelector('div');

            await uploadFileWithProgress(signedUrl, file, (progress) => {
                 progressBarInner.style.width = `${progress}%`;
            });

            progressBarInner.style.width = '100%';
            showToast("Soubor úspěšně nahrán.", false);
            
            // 3. (Volitelné) Aktualizujeme Firestore dokument, pokud je potřeba
            // Např. pokud bychom chtěli uložit veřejnou URL (což neděláme)
            // const publicUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;
            // await updateDoc(doc(mediaCollectionRef, documentId), { publicUrl: publicUrl });
        }
        
        document.getElementById(`${prefix}-form`).reset();
        onMediaTypeChange({ target: { value: mediaType } }, prefix); // Reset formuláře

    } catch (error) {
        console.error("Error handling file upload:", error);
        showToast(`Nahrávání selhalo: ${error.message}`, true);
    } finally {
        uploadButton.disabled = false;
        uploadButton.innerHTML = 'Nahrát';
        const progressBar = document.getElementById(`${prefix}-progress-bar`);
        progressBar.classList.add('hidden');
        progressBar.querySelector('div').style.width = '0%';
    }
}

/**
 * Nahrává soubor pomocí XHR, aby mohl sledovat pokrok.
 * @param {string} url - Podepsaná URL.
 * @param {File} file - Soubor.
 * @param {function} onProgress - Callback (progress 0-100).
 * @returns {Promise<void>}
 */
function uploadFileWithProgress(url, file, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url, true);
        xhr.setRequestHeader('Content-Type', file.type);

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100;
                onProgress(percentComplete);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                onProgress(100);
                resolve();
            } else {
                reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`));
            }
        };

        xhr.onerror = () => {
            reject(new Error('Network error during upload.'));
        };

        xhr.send(file);
    });
}


/**
 * Načte a zobrazí knihovnu médií pro daného profesora.
 * @param {string} mode - 'modal' (zobrazí checkboxy) nebo 'view' (jen zobrazí)
 */
function loadMediaLibrary(mode = 'view') {
    if (!uploaderProfessorId) return;

    const gridContainer = document.getElementById('media-library-grid');
    gridContainer.innerHTML = '<p class="text-slate-500 col-span-full">Načítám média...</p>';

    const q = query(
        collection(db, 'professors', uploaderProfessorId, 'media'),
        orderBy("uploadedAt", "desc")
    );

    // Zrušíme starý listener, pokud existuje
    if (mediaListUnsubscribe) mediaListUnsubscribe();

    mediaListUnsubscribe = onSnapshot(q, (snapshot) => {
        // Aktualizujeme globální data médií
        allMediaData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (snapshot.empty) {
            gridContainer.innerHTML = '<p class="text-slate-500 col-span-full">Knihovna médií je prázdná.</p>';
            return;
        }

        gridContainer.innerHTML = allMediaData.map(media => {
            const id = media.id;
            const isSelected = mode === 'modal' && selectedMediaForEditor.includes(id);
            
            let icon, title, details;
            switch(media.type) {
                case 'video':
                    icon = '🎬';
                    title = media.fileName;
                    details = `<span class="text-blue-600 text-xs">${media.url.substring(0, 30)}...</span>`;
                    break;
                case 'presentation':
                    icon = '📊';
                    title = media.fileName;
                    details = `<span class="text-gray-500 text-xs">${media.type}</span>`;
                    break;
                case 'image':
                    icon = '🖼️';
                    title = media.fileName;
                    details = `<span class="text-gray-500 text-xs">${media.type}</span>`;
                    break;
                default:
                    icon = '📁';
                    title = media.fileName;
                    details = `<span class="text-gray-500 text-xs">${media.type || 'Soubor'}</span>`;
            }

            return `
                <div 
                    class="media-card border rounded-lg p-2 text-center text-sm relative group cursor-pointer ${isSelected ? 'bg-green-100 border-green-500 ring-2 ring-green-500' : 'bg-white hover:bg-slate-50'}" 
                    data-media-id="${id}"
                >
                    ${mode === 'modal' ? 
                        `<input type="checkbox" class="media-select-checkbox absolute top-2 left-2 z-10" data-media-id="${id}" ${isSelected ? 'checked' : ''}>` 
                        : ''}
                    
                    <div class="text-3xl mb-1">${icon}</div>
                    <p class="text-xs text-slate-700 font-semibold break-words leading-tight">${title}</p>
                    ${details}
                    
                    <button class="delete-media-btn absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 z-10" data-media-id="${id}" data-file-path="${media.filePath || ''}">
                        &times;
                    </button>
                </div>
            `;
        }).join('');
        
        // Navázání listenerů
        gridContainer.querySelectorAll('.delete-media-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                deleteMedia(btn.dataset.mediaId, btn.dataset.filePath);
            });
        });
        
        if (mode === 'modal') {
             gridContainer.querySelectorAll('.media-card, .media-select-checkbox').forEach(item => {
                item.addEventListener('click', (e) => {
                    const card = e.currentTarget.closest('.media-card');
                    const mediaId = card.dataset.mediaId;
                    const checkbox = card.querySelector('.media-select-checkbox');
                    
                    // Zabráníme dvojitému spuštění (klik na kartu a pak na checkbox)
                    if (e.target.tagName === 'INPUT') {
                         // Klik byl na checkbox
                         toggleMediaSelection(mediaId, checkbox.checked);
                    } else {
                         // Klik byl na kartu
                         const isChecked = !checkbox.checked;
                         checkbox.checked = isChecked;
                         toggleMediaSelection(mediaId, isChecked);
                    }
                    // Znovu vykreslíme kartu (pro vizuální změnu)
                    loadMediaLibrary('modal'); 
                });
            });
        }

    }, (error) => {
        console.error("Error loading media library:", error);
        gridContainer.innerHTML = '<p class="text-red-500 col-span-full">Chyba při načítání médií.</p>';
    });
}

/**
 * Přepne výběr média v modálním okně.
 * @param {string} mediaId 
 * @param {boolean} isSelected 
 */
function toggleMediaSelection(mediaId, isSelected) {
    if (isSelected) {
        if (!selectedMediaForEditor.includes(mediaId)) {
            selectedMediaForEditor.push(mediaId);
        }
    } else {
        selectedMediaForEditor = selectedMediaForEditor.filter(id => id !== mediaId);
    }
    console.log("Aktuální výběr:", selectedMediaForEditor);
}


/**
 * Smaže médium z Firestore a Storage.
 * @param {string} docId - ID dokumentu v Firestore.
 * @param {string} filePath - Cesta k souboru ve Storage (např. 'profId/media/file.pdf').
 */
async function deleteMedia(docId, filePath) {
    if (!docId) return;
    if (!confirm("Opravdu chcete smazat toto médium? Bude odstraněno i ze všech lekcí, které ho používají.")) return;

    try {
        // 1. Smazat dokument z Firestore
        const docRef = doc(db, 'professors', uploaderProfessorId, 'media', docId);
        await deleteDoc(docRef);
        
        // 2. Smazat soubor ze Storage, pokud má cestu (YouTube videa nemají)
        if (filePath) {
            const fileRef = ref(firebaseInit.storage, filePath);
            await deleteObject(fileRef);
        }
        
        // 3. Odebrat médium z 'selectedMediaForEditor', pokud tam bylo
        selectedMediaForEditor = selectedMediaForEditor.filter(id => id !== docId);

        showToast("Médium bylo smazáno.", false);
        // Listener 'onSnapshot' v 'loadMediaLibrary' se postará o překreslení
        
        // TODO: Projít všechny lekce a odebrat toto médium z pole 'media'
        // (Toto je komplexnější operace, prozatím vynecháno)
        
    } catch (error) {
        console.error("Error deleting media:", error);
        showToast(`Chyba při mazání média: ${error.message}`, true);
    }
}


// ==================================================================
// Správa nahrávání obrázků z Quill editoru
// ==================================================================

/**
 * Zpracuje nahrání obrázku vloženého přímo do Quill editoru.
 * @param {File} file 
 * @param {object} quillInstance - Instance Quill, do které se má vložit URL.
 */
async function handleQuillImageUpload(file, quillInstance) {
    if (!uploaderProfessorId) {
        showToast("Chyba: Není nastaven profesor. Nelze nahrát obrázek.", true);
        return null;
    }
    
    showToast("Nahrávám obrázek...", false);

    try {
        // 1. Zavoláme CF pro získání podepsané URL
        const uploadFileFunc = httpsCallable(firebaseInit.functions, 'uploadFile');
        const result = await uploadFileFunc({
            fileName: `quill_image_${Date.now()}_${file.name}`,
            contentType: file.type,
            mediaType: 'image' // Ukládáme jako typ 'image'
        });
        
        const { signedUrl, documentId } = result.data;

        // 2. Nahrání souboru přímo do GCS
        await uploadFileWithProgress(signedUrl, file, (progress) => {
             console.log(`Quill upload progress: ${progress}%`);
        });
        
        // 3. Získání cesty ke storage (měla by být v 'result.data.filePath')
        const storagePath = (await getDoc(doc(db, 'professors', uploaderProfessorId, 'media', documentId))).data().storagePath;
        if (!storagePath) throw new Error("Storage path not found after upload.");
        
        // 4. Získání *veřejné* URL (Toto je zjednodušení, spoléhá na to, že soubory jsou veřejně čitelné)
        // Lepší přístup by byl použít `getDownloadURL`, ale to vyžaduje více práce
        // Pro jednoduchost použijeme public GCS URL formát:
        const bucketName = firebaseInit.storage.bucket().name;
        const publicUrl = `https://storage.googleapis.com/${bucketName}/${storagePath}`;

        showToast("Obrázek úspěšně nahrán.", false);
        return publicUrl; // Vrátíme URL, kterou Quill vloží do textu
        
    } catch (error) {
        console.error("Error uploading Quill image:", error);
        showToast(`Nahrání obrázku selhalo: ${error.message}`, true);
        return null;
    }
}

// Tato funkce je z původního souboru, ale zdá se, že je nahrazena 'openMediaUploaderModal'
// Ponechávám ji tu pro případnou zpětnou kompatibilitu, pokud ji volá něco jiného
function initializeModalMediaUpload(callback) {
     console.warn("Volána stará funkce 'initializeModalMediaUpload', zvažte použití 'openMediaUploaderModal'");
     // Původní logika:
     // openMediaUploaderModal(callback, []);
}
