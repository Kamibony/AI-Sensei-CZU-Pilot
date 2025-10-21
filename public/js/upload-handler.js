// Súbor: public/js/upload-handler.js
// Verzia: Plná (310 riadkov), rešpektujúca pôvodnú štruktúru + Multi-Profesor

import { getStorage, ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getFirestore, collection, addDoc, serverTimestamp, query, where, orderBy, getDocs, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, functions, storage } from './firebase-init.js'; // Používame db, functions a storage z firebase-init
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { showToast } from './utils.js';

// --- NOVÁ GLOBÁLNA PREMENNÁ MODULU ---
let currentProfessorId = null;
// -------------------------------------

/**
 * Inicializuje logiku nahrávání a zobrazení médií pro stránku "Média".
 * @param {string} courseId - ID kurzu (nebo 'main-course' pro hlavní knihovnu).
 * @param {string} professorId - ID přihlášeného profesora.
 */
export function initializeCourseMediaUpload(courseId, professorId) { // <-- ZMENA 1: Pridaný 'professorId'
    
    // --- ZMENA 2: Nastavenie globálnej premennej ---
    currentProfessorId = professorId;
    if (!currentProfessorId) {
        console.error("initializeCourseMediaUpload: professorId není nastaveno!");
        showToast("Kritická chyba: Nelze identifikovat profesora.", true);
        return;
    }
    // ---------------------------------------------

    const uploadArea = document.getElementById('course-media-upload-area');
    const fileInput = document.getElementById('course-media-file-input');
    const mediaListContainer = document.getElementById('course-media-list');
    
    // Provizorní progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'w-full bg-slate-200 rounded-full h-2.5 mt-2 hidden';
    progressBar.innerHTML = `<div class="bg-green-600 h-2.5 rounded-full" style="width: 0%"></div>`;
    
    // Vložení progress baru (pokud existuje rodič uploadArea)
    if (uploadArea && uploadArea.parentNode) {
        uploadArea.parentNode.insertBefore(progressBar, uploadArea.nextSibling);
    }

    if (!uploadArea || !fileInput || !mediaListContainer) {
        console.warn("Některé elementy pro nahrávání médií chybí v DOM (stránka Média).");
        return;
    }

    // Otevření file dialogu
    uploadArea.addEventListener('click', () => fileInput.click());

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('border-green-400', 'bg-green-50');
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('border-green-400', 'bg-green-50');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('border-green-400', 'bg-green-50');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0], courseId, progressBar, 'course-media-list');
        }
    });

    // Výběr souboru
    fileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            handleFileUpload(files[0], courseId, progressBar, 'course-media-list');
        }
    });

    // Načtení existujících souborů
    renderMediaLibraryFiles(courseId, 'course-media-list');
}


/**
 * Inicializuje logiku nahrávání médií pro MODÁLNÍ okno editoru.
 * @param {function} callback - Funkce volaná po úspěšném nahrání.
 * @param {object} editorInstance - Instance TinyMCE editoru (pokud je potřeba).
 * @param {string} professorId - ID přihlášeného profesora.
 */
export function initializeModalMediaUpload(callback, editorInstance, professorId) { // <-- ZMENA 3: Pridaný 'professorId'
    
    // --- ZMENA 4: Nastavenie globálnej premennej ---
    currentProfessorId = professorId;
    if (!currentProfessorId) {
        console.error("initializeModalMediaUpload: professorId není nastaveno!");
        // Nelze použít showToast, nemusí být vidět
        alert("Kritická chyba: Nelze identifikovat profesora v modálním okně.");
        return;
    }
    // ---------------------------------------------
    
    const modalUploadArea = document.getElementById('modal-media-upload-area');
    const modalFileInput = document.getElementById('modal-media-file-input');
    const modalMediaList = document.getElementById('modal-media-library-list');
    
    // Progress bar v modálním okně
    const modalProgressBar = document.getElementById('modal-upload-progress-bar');

    if (!modalUploadArea || !modalFileInput || !modalMediaList) {
        console.warn("Některé elementy pro nahrávání médií chybí v DOM (Modální okno).");
        return;
    }

    // Otevření file dialogu
    modalUploadArea.addEventListener('click', () => modalFileInput.click());

    // Drag and drop
    modalUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        modalUploadArea.classList.add('border-green-400', 'bg-green-50');
    });
    modalUploadArea.addEventListener('dragleave', () => {
        modalUploadArea.classList.remove('border-green-400', 'bg-green-50');
    });
    modalUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        modalUploadArea.classList.remove('border-green-400', 'bg-green-50');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0], 'main-course', modalProgressBar, 'modal-media-library-list', callback);
        }
    });

    // Výběr souboru
    modalFileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            handleFileUpload(files[0], 'main-course', modalProgressBar, 'modal-media-library-list', callback);
        }
    });

    // Načtení existujících souborů
    renderModalMediaFiles('modal-media-library-list');
}

/**
 * Zpracuje nahrání souboru pomocí Firebase Function (společné pro obě).
 * @param {File} file - Soubor k nahrání.
 * @param {string} courseId - ID kurzu.
 * @param {HTMLElement} progressBar - Element progress baru (nebo jeho kontejner).
 * @param {string} listContainerId - ID kontejneru seznamu souborů k obnovení.
 * @param {function} [onSuccessCallback] - Volitelný callback po úspěchu (pro modál).
 */
async function handleFileUpload(file, courseId, progressBar, listContainerId, onSuccessCallback = null) {
    if (!file) return;

    // TODO: Zde by měla být kontrola typu souboru (např. PDF, obrázky, video)
    // Příklad:
    // const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'video/mp4'];
    // if (!allowedTypes.includes(file.type)) {
    //     showToast("Nepodporovaný typ souboru.", true);
    //     return;
    // }

    const progressBarInner = progressBar.firstElementChild; // Předpokládáme vnořený <div>

    progressBar.classList.remove('hidden');
    progressBarInner.style.width = '10%'; // Indikace startu

    // Přečtení souboru jako Base64
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
        const fileContent = reader.result; // base64 string
        const fileName = file.name;
        const fileType = file.type;

        try {
            progressBarInner.style.width = '30%';
            const uploadFile = httpsCallable(functions, 'uploadFile');
            
            // Backendová funkce 'uploadFile' si vezme professorId sama z kontextu (context.auth.uid)
            // Tím je zajištěno, že nahrává do správné složky
            const result = await uploadFile({ fileName, fileType, fileContent, courseId });
            
            progressBarInner.style.width = '100%';

            if (result.data.success) {
                showToast("Soubor úspěšně nahrán.", false);
                
                // Obnovení seznamu souborů v příslušném kontejneru
                if (listContainerId === 'course-media-list') {
                    renderMediaLibraryFiles(courseId, listContainerId);
                } else if (listContainerId === 'modal-media-library-list') {
                    renderModalMediaFiles(listContainerId);
                }

                // Pokud byl poskytnut callback (pro modál), zavoláme ho s daty nového souboru
                if (onSuccessCallback) {
                    onSuccessCallback(result.data); // result.data by měla obsahovat { id, fileName, fileType, url }
                }

            } else {
                throw new Error(result.data.message || "Neznámá chyba nahrávání");
            }

        } catch (error) {
            console.error("Chyba při nahrávání souboru:", error);
            showToast(`Chyba při nahrávání: ${error.message}`, true);
        } finally {
            setTimeout(() => {
                progressBar.classList.add('hidden');
                progressBarInner.style.width = '0%';
            }, 1000);
        }
    };
    reader.onerror = (error) => {
        console.error("Chyba při čtení souboru:", error);
        showToast("Chyba při čtení souboru.", true);
        progressBar.classList.add('hidden');
    };
}


/**
 * Načte a vykreslí soubory z knihovny médií pro stránku "Média".
 * @param {string} courseId - ID kurzu.
 * @param {string} containerId - ID HTML elementu, kam se má seznam vykreslit.
 */
export async function renderMediaLibraryFiles(courseId, containerId) { // <-- ZMENA 5: Podpis OK, použije glob. premennú
    const container = document.getElementById(containerId);
    if (!container) return;

    // --- ZMENA 6: Kontrola 'currentProfessorId' ---
    if (!currentProfessorId) {
        console.error("renderMediaLibraryFiles: Chybí currentProfessorId.");
        container.innerHTML = '<li class="text-sm text-red-500">Chyba: Nelze identifikovat profesora.</li>';
        return;
    }
    // -------------------------------------

    container.innerHTML = '<li class="text-sm text-slate-400">Načítám soubory...</li>';

    try {
        // --- ZMENA 7: Úprava cesty pre query ---
        const mediaCollectionRef = collection(db, 'professors', currentProfessorId, 'media');
        // -------------------------------------
        
        const q = query(
            mediaCollectionRef,
            where('courseId', '==', courseId),
            orderBy('uploadedAt', 'desc')
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = '<li class="text-sm text-slate-400">Zatím nebyly nahrány žádné soubory.</li>';
            return;
        }

        container.innerHTML = querySnapshot.docs.map(doc => {
            const file = doc.data();
            const icon = file.fileType.startsWith('image/') ? '🖼️' : '📄';
            return `
                <li class="flex items-center justify-between p-3 border-b border-slate-100" data-id="${doc.id}">
                    <div class="flex items-center space-x-3 overflow-hidden">
                        <span class="text-xl">${icon}</span>
                        <div class="overflow-hidden">
                            <p class="text-sm font-medium text-slate-700 truncate">${file.fileName}</p>
                            <p class="text-xs text-slate-500">${file.fileType}</p>
                        </div>
                    </div>
                    <button class="delete-media-btn text-xs text-red-500 hover:text-red-700 flex-shrink-0" data-id="${doc.id}" data-filename="${file.fileName}">Smazat</button>
                </li>
            `;
        }).join('');

        // Přidání listenerů na 'delete-media-btn'
        container.querySelectorAll('.delete-media-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const docId = e.currentTarget.dataset.id;
                const fileName = e.currentTarget.dataset.filename;
                handleDeleteMedia(docId, fileName, courseId, containerId);
            });
        });

    } catch (error) {
        console.error("Error fetching media files:", error);
        container.innerHTML = `<li class="text-sm text-red-500">Chyba při načítání souborů: ${error.message}</li>`;
    }
}

/**
 * Načte a vykreslí soubory z knihovny médií pro MODÁLNÍ okno.
 * @param {string} containerId - ID HTML elementu, kam se má seznam vykreslit.
 */
export async function renderModalMediaFiles(containerId) { // <-- ZMENA 8: Podpis OK, použije glob. premennú
    const container = document.getElementById(containerId);
    if (!container) return;

    // --- ZMENA 9: Kontrola 'currentProfessorId' ---
    if (!currentProfessorId) {
        console.error("renderModalMediaFiles: Chybí currentProfessorId.");
        container.innerHTML = '<li class="text-sm text-red-500">Chyba: Nelze identifikovat profesora.</li>';
        return;
    }
    // -------------------------------------

    container.innerHTML = '<li class="text-sm text-slate-400">Načítám soubory...</li>';

    try {
        // --- ZMENA 10: Úprava cesty pre query ---
        const mediaCollectionRef = collection(db, 'professors', currentProfessorId, 'media');
        // --------------------------------------
        
        // Zobrazíme všechny soubory (bez filtru courseId) nebo můžeme přidat filtr?
        // Prozatím zobrazíme všechny
        const q = query(
            mediaCollectionRef,
            orderBy('uploadedAt', 'desc')
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = '<li class="text-sm text-slate-400">Knihovna je prázdná.</li>';
            return;
        }

        container.innerHTML = querySnapshot.docs.map(doc => {
            const file = doc.data();
            const icon = file.fileType.startsWith('image/') ? '🖼️' : (file.fileType.startsWith('video/') ? '▶️' : '📄');
            return `
                <li class="modal-media-item p-2 rounded-lg hover:bg-slate-100 cursor-pointer flex items-center space-x-2" 
                    data-id="${doc.id}" 
                    data-url="${file.url}" 
                    data-type="${file.fileType}" 
                    data-name="${file.fileName}">
                    <span class="text-lg">${icon}</span>
                    <span class="text-sm font-medium text-slate-700 truncate">${file.fileName}</span>
                </li>
            `;
        }).join('');

        // Listenery pro výběr souboru v modálu (řeší editor-handler.js)

    } catch (error) {
        console.error("Error fetching modal media files:", error);
        container.innerHTML = `<li class="text-sm text-red-500">Chyba při načítání souborů: ${error.message}</li>`;
    }
}


/**
 * Smaže soubor ze Storage a Firestore.
 * @param {string} docId - ID dokumentu ve Firestore.
 * @param {string} fileName - Název souboru ve Storage.
 * @param {string} courseId - ID kurzu (pro obnovení seznamu).
 * @param {string} containerId - ID kontejneru pro obnovení.
 */
async function handleDeleteMedia(docId, fileName, courseId, containerId) {
    
    // --- ZMENA 11: Kontrola 'currentProfessorId' ---
    if (!currentProfessorId) {
        showToast("Chyba: Nelze identifikovat profesora.", true);
        return;
    }
    // ------------------------------------------

    if (!confirm(`Opravdu chcete trvale smazat soubor "${fileName}"?`)) {
        return;
    }

    try {
        // 1. Smazat soubor ze Storage
        // --- ZMENA 12: Úprava cesty pre Storage ---
        const fileRef = ref(storage, `${currentProfessorId}/media/${fileName}`);
        // ---------------------------------------
        await deleteObject(fileRef);

        // 2. Smazat záznam z Firestore
        // --- ZMENA 13: Úprava cesty pre Firestore ---
        await deleteDoc(doc(db, 'professors', currentProfessorId, 'media', docId));
        // ----------------------------------------
        
        showToast("Soubor byl smazán.", false);
        
        // Obnovit seznam
        renderMediaLibraryFiles(courseId, containerId);

    } catch (error) {
        console.error("Chyba při mazání souboru:", error);
        if (error.code === 'storage/object-not-found') {
            // Soubor už ve Storage není, smažeme jen Firestore
            try {
                // --- ZMENA 14: Úprava cesty pre Firestore (fallbck) ---
                await deleteDoc(doc(db, 'professors', currentProfessorId, 'media', docId));
                // ----------------------------------------------------
                showToast("Záznam o souboru smazán (soubor již neexistoval).", false);
                renderMediaLibraryFiles(courseId, containerId);
            } catch (dbError) {
                showToast("Chyba při mazání záznamu z databáze.", true);
            }
        } else {
            showToast(`Chyba při mazání souboru: ${error.message}`, true);
        }
    }
}
