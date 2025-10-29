// public/js/upload-handler.js
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject, listAll, getMetadata } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import * as firebaseInit from './firebase-init.js';
import { showToast } from "./utils.js";

// Funkcia na spracovanie nahrávania súborov
async function handleFileUpload(files, courseId, progressContainer, mediaListContainer, onCompleteCallback) {
    if (!files || files.length === 0) return;
    if (!progressContainer) {
        console.error("Progress container not found for uploads.");
        // return; // Pokračujeme aj bez progress baru, ale zobrazíme chybu
    } else {
         progressContainer.classList.remove('hidden');
         progressContainer.innerHTML = ''; // Vyčistíme staré progressy
    }


    const storage = getStorage(firebaseInit.app);
    const uploadPromises = [];

    Array.from(files).forEach(file => {
        if (file.type !== 'application/pdf') {
            showToast(`Soubor ${file.name} není PDF a bude přeskočen.`, true);
            return; // Preskočíme ne-PDF súbory
        }

        const storageRef = ref(storage, `courses/${courseId}/media/${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        // Vytvoríme progress bar element (ak máme kontajner)
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
                        progressElement.classList.add('bg-red-100'); // Označíme chybu
                        progressElement.querySelector('.percentage').textContent = 'Chyba!';
                        // Necháme ho tam chvíľu, aby si používateľ všimol
                        setTimeout(() => progressElement?.remove(), 5000);
                     }
                    reject(error); // Zamietneme promise
                },
                async () => {
                    console.log(`Upload ${file.name} complete.`);
                    // Optional: Získanie download URL
                    // const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    if (progressElement) {
                         // Krátke zobrazenie 100% a potom odstránenie
                         progressBar.style.width = '100%';
                         progressElement.querySelector('.percentage').textContent = '100%';
                         setTimeout(() => progressElement?.remove(), 1500); // Odstránime po chvíli
                    }
                    resolve(); // Potvrdíme promise
                }
            );
        });
        uploadPromises.push(promise);
    });

    try {
        await Promise.all(uploadPromises);
        showToast("Všechny vybrané PDF soubory byly nahrány.");
        if (onCompleteCallback) {
            onCompleteCallback(); // Zavoláme callback na obnovenie zoznamu
        }
    } catch (error) {
        // Chyby jednotlivých uploadov sa už logovali a zobrazili
        console.error("Some uploads failed.", error);
        showToast("Některé soubory se nepodařilo nahrát.", true);
         // Aj v prípade chyby skúsime obnoviť zoznam, možno sa niečo nahralo
         if (onCompleteCallback) {
            onCompleteCallback();
        }
    } finally {
         // Skryjeme progress kontajner, ak je prázdny po určitom čase
         setTimeout(() => {
             if (progressContainer && progressContainer.children.length === 0) {
                 progressContainer.classList.add('hidden');
             }
         }, 2000);
    }
}

// --- Funkcie pre RAG výber (zostávajú rovnaké) ---
let selectedFiles = []; // Globálna premenná pre vybrané RAG súbory

export function clearSelectedFiles() { selectedFiles = []; }
export function getSelectedFiles() { return [...selectedFiles]; } // Vráti kópiu

// Načíta predvybrané súbory (napr. pri otvorení editora)
// === OPRAVENÁ FUNKCIA: Normalizácia dát ===
export function loadSelectedFiles(initialFiles = []) {
     clearSelectedFiles(); // Najprv vyčistíme
     if (!Array.isArray(initialFiles)) {
         initialFiles = [];
     }
     
     selectedFiles = initialFiles.map(file => {
        if (typeof file === 'string') {
            // Konvertujeme string (fullPath) na objekt
            return {
                name: file.split('/').pop(), // Extrahujeme meno súboru z cesty
                fullPath: file
            };
        } else if (file && file.name && file.fullPath) {
            // Je to už správny objekt
            return file;
        }
        return null; // Ignorujeme neplatné položky
     }).filter(file => file !== null); // Odstránime null hodnoty

     console.log("Loaded RAG files (normalized):", selectedFiles);
}

// Renderuje zoznam vybraných RAG súborov
export function renderSelectedFiles(listElementId = "selected-files-list-rag") {
    const listEl = document.getElementById(listElementId);
    if (!listEl) return;

    if (selectedFiles.length === 0) {
        listEl.innerHTML = '<li>Žádné soubory nevybrány.</li>';
    } else {
        // === OPRAVA: renderujeme file.name (po normalizácii v loadSelectedFiles) ===
        listEl.innerHTML = selectedFiles.map((file, index) => `
            <li class="flex items-center justify-between text-xs text-slate-700 group">
                <span class="truncate pr-2" title="${file.fullPath}">${file.name}</span>
                <button data-index="${index}" class="remove-rag-file-btn p-0.5 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
            </li>
        `).join('');

        // Pridanie listenerov na mazanie
        listEl.querySelectorAll('.remove-rag-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const indexToRemove = parseInt(e.currentTarget.dataset.index);
                selectedFiles.splice(indexToRemove, 1);
                renderSelectedFiles(listElementId); // Prerenderujeme zoznam
            });
        });
    }
}


// Renderuje zoznam dostupných súborov v modálnom okne
// === OPRAVENÁ FUNKCIA: Použitie createElement na opravu chyby zobrazenia ===
export async function renderMediaLibraryFiles(courseId, listElementId) {
    const listEl = document.getElementById(listElementId);
    if (!listEl) {
        console.error(`Element with ID ${listElementId} not found for media library modal.`);
        return;
    }
    listEl.innerHTML = '<p class="text-slate-500 text-sm">Načítám soubory...</p>'; // Loading state

    try {
        const storage = getStorage(firebaseInit.app);
        const listRef = ref(storage, `courses/${courseId}/media`);
        const res = await listAll(listRef);

        if (res.items.length === 0) {
            listEl.innerHTML = '<p class="text-slate-500 text-sm">V knihovně nejsou žádné soubory.</p>';
            return;
        }

        const filePromises = res.items.map(async (itemRef) => {
            const metadata = await getMetadata(itemRef);
            return { name: metadata.name, fullPath: metadata.fullPath };
        });
        const allFiles = await Promise.all(filePromises);
        allFiles.sort((a,b) => a.name.localeCompare(b.name)); // Zoradíme podľa názvu

        // === ZAČIATOK ÚPRAVY: Použitie createElement ===
        listEl.innerHTML = ''; // Vyčistíme "Načítám..."
        allFiles.forEach(file => {
            // Kontrola oproti globálnej premennej (ktorú sme načítali pred otvorením modalu)
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
            checkbox.addEventListener('change', handleCheckboxChange); // Pridáme listener

            const span = document.createElement('span');
            span.className = "text-slate-700 truncate";
            span.title = file.name;
            span.textContent = file.name; // *** Explicitné nastavenie textu ***

            label.appendChild(checkbox);
            label.appendChild(span);
            li.appendChild(label);
            listEl.appendChild(li);
        });
        // === KONIEC ÚPRAVY ===

    } catch (error) {
        console.error("Error listing files for modal:", error);
        listEl.innerHTML = '<p class="text-red-500 text-sm">Nepodařilo se načíst soubory.</p>';
    }
}

// Handler pre zmenu checkboxu v RAG modale
function handleCheckboxChange(e) {
    const checkbox = e.target;
    const fileData = {
        name: checkbox.dataset.filename,
        fullPath: checkbox.dataset.fullpath
    };

    if (checkbox.checked) {
        // Pridáme, ak ešte neexistuje
        if (!selectedFiles.some(f => f.fullPath === fileData.fullPath)) {
            selectedFiles.push(fileData);
        }
    } else {
        // Odstránime
        selectedFiles = selectedFiles.filter(f => f.fullPath !== fileData.fullPath);
    }
    console.log("Selected RAG files:", selectedFiles);
}


// === UPRAVENÁ FUNKCIA initializeCourseMediaUpload ===
// Pridali sme parameter 'containerElement' a používame querySelector
export function initializeCourseMediaUpload(courseId, onUploadCompleteCallback = null, containerElement = document) {
    // Použijeme containerElement.querySelector namiesto document.getElementById
    const uploadArea = containerElement.querySelector('#course-media-upload-area');
    const fileInput = containerElement.querySelector('#course-media-file-input');
    // Tieto elementy potrebujeme nájsť len ak handleFileUpload potrebuje progress bar a zoznam
    const mediaList = containerElement.querySelector('#course-media-list-container'); // Zmenené ID pre kontajner zoznamu
    const progressContainer = containerElement.querySelector('#upload-progress-container');

    // Základná kontrola len na uploadArea a fileInput
    if (!uploadArea || !fileInput) {
        console.warn("Upload elements (#course-media-upload-area, #course-media-file-input) not found within the provided container. Upload functionality might be broken.");
        return; // Zastavíme inicializáciu, ak chýbajú kľúčové prvky
    }
    // Upozornenie, ak chýba progress alebo list kontajner, ale pokračujeme
    if (!mediaList) console.warn("Element #course-media-list-container not found. Uploaded file list might not refresh visually within this component (but upload should work).");
    if (!progressContainer) console.warn("Element #upload-progress-container not found. Upload progress might not be displayed.");


    // --- Zvyšok funkcie zostáva rovnaký ---
    uploadArea.addEventListener('click', (e) => {
         // Zabránime kliknutiu, ak bol kliknutý vnorený prvok (napr. tlačidlo v drag-drop zóne)
        if (e.target === uploadArea || e.target.classList.contains('pointer-events-none') || e.target.closest('.pointer-events-none')) {
            fileInput.click();
        }
    });

    fileInput.addEventListener('change', (e) => {
        // === OPRAVA ===
        // Použijeme správny názov premennej: onUploadCompleteCallback
        handleFileUpload(e.target.files, courseId, progressContainer, mediaList, onUploadCompleteCallback);
        fileInput.value = ''; // Reset inputu
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('border-green-500', 'bg-green-50', 'shadow-inner'); // Pridaný tieň
    });
    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        // Odstránime triedy iba ak kurzor opustil CELÚ oblasť (nie len vnorený prvok)
        if (!uploadArea.contains(e.relatedTarget)) {
            uploadArea.classList.remove('border-green-500', 'bg-green-50', 'shadow-inner');
        }
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('border-green-500', 'bg-green-50', 'shadow-inner');
        if (e.dataTransfer.files) {
            // === OPRAVA ===
            // Použijeme správny názov premennej: onUploadCompleteCallback
            handleFileUpload(e.dataTransfer.files, courseId, progressContainer, mediaList, onUploadCompleteCallback);
        }
    });
}
// === KONIEC UPRAVENEJ FUNKCIE ===
