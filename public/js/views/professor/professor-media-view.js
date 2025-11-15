// public/js/views/professor/professor-media-view.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { auth } from '../../firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
// Odstránime import renderMediaLibraryFiles, už sa nevolá odtiaľto
import { initializeCourseMediaUpload } from '../../upload-handler.js';
import * as firebaseInit from '../../firebase-init.js';
import { storage } from '../../firebase-init.js';
import { ref, listAll, getMetadata, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { showToast } from '../../utils.js';

export class ProfessorMediaView extends LitElement {
    static properties = {
        _files: { state: true, type: Array },
        _isLoading: { state: true, type: Boolean },
    };

    constructor() {
        super();
        this._files = [];
        this._isLoading = true;
    }

    createRenderRoot() {
        return this; // Light DOM
    }

    connectedCallback() {
        super.connectedCallback();

        // NESPÚŠŤAJ TOTO IHNEĎ:
        // this._loadFiles();

        // Namiesto toho počkaj na potvrdenie prihlásenia od Firebase:
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                // Výborne, používateľ je prihlásený a token je pripravený.
                // Až teraz môžeme bezpečne načítať súbory.
                console.log('Auth state confirmed, loading media files...');
                this._loadFiles();
                unsubscribe(); // Dôležité: Odhlásime listener, aby sa nespustil viackrát
            } else {
                // Toto by sa nemalo stať, ak je používateľ na tejto stránke,
                // ale pre istotu:
                console.error('User is not authenticated. Cannot load media files.');
                this.errorMessage = 'Chyba: Nejste přihlášen.';
                this.loading = false;
                unsubscribe();
            }
        });
    }

    firstUpdated() {
        // === ZMENA: Odovzdáme 'this' ako tretí argument ===
        // Callback funkcia this._loadFiles.bind(this) zabezpečí správny kontext
        initializeCourseMediaUpload("main-course", this._loadFiles.bind(this), this);
        // ===============================================
    }

    async _loadFiles() {
        this._isLoading = true;
        try {
            const user = firebaseInit.auth.currentUser;
            if (!user) {
                this._files = [];
                this._isLoading = false;
                return;
            }
            const listRef = ref(storage, `courses/main-course/media`);
            const res = await listAll(listRef);
            const filePromises = res.items.map(async (itemRef) => {
                const metadata = await getMetadata(itemRef);
                const isLegacy = !metadata.customMetadata || !metadata.customMetadata.ownerId;
                if (user.email === 'profesor@profesor.cz') {
                     return { name: metadata.name, fullPath: metadata.fullPath, size: metadata.size, ownerId: metadata.customMetadata?.ownerId };
                } else {
                    if (isLegacy || metadata.customMetadata.ownerId === user.uid) {
                         return { name: metadata.name, fullPath: metadata.fullPath, size: metadata.size, ownerId: metadata.customMetadata?.ownerId };
                    }
                }
                return null;
            });

            const files = (await Promise.all(filePromises)).filter(Boolean);
            this._files = files.sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            console.error("Error loading media files:", error);
            showToast("Nepodařilo se načíst soubory z knihovny.", true);
            this._files = [];
        } finally {
            this._isLoading = false;
        }
    }

    _formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes'; const k = 1024; const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    async _deleteFile(filePath, fileName) {
        if (!confirm(`Opravdu chcete trvale smazat soubor "${fileName}"?`)) return;
        try {
            const fileRef = ref(storage, filePath);
            await deleteObject(fileRef);
            showToast(`Soubor "${fileName}" byl smazán.`);
            // Odstránime súbor z lokálneho stavu a obnovíme zobrazenie
            this._files = this._files.filter(file => file.fullPath !== filePath);
        } catch (error) {
            console.error("Error deleting file:", error);
            showToast(`Chyba při mazání souboru: ${error.message}`, true);
        }
    }

    render() {
        let fileListContent;
        if (this._isLoading) { fileListContent = html`<div class="text-center text-slate-500 py-6"><div class="spinner-large mx-auto"></div><p class="mt-2">Načítám soubory...</p></div>`; }
        else if (this._files.length === 0) { fileListContent = html`<p class="text-center text-slate-500 py-6">Zatím nebyly nahrány žádné soubory.</p>`; }
        else {
            fileListContent = html`
                <ul class="space-y-3">
                    ${this._files.map(file => html`
                        <li class="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors group">
                            <div class="flex items-center space-x-3 min-w-0">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-600 flex-shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                <div class="min-w-0">
                                    <p class="text-sm font-medium text-slate-800 truncate" title="${file.name}">${file.name}</p>
                                    <p class="text-xs text-slate-500">${this._formatFileSize(file.size)}</p>
                                </div>
                            </div>
                            <button @click=${() => this._deleteFile(file.fullPath, file.name)} title="Smazat soubor" class="ml-4 p-1.5 rounded-full text-slate-400 hover:bg-red-100 hover:text-red-600 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </li>
                    `)}
                </ul>
            `;
        }

        return html`
            <header class="text-center p-6 border-b border-slate-200 bg-white">
                <h1 class="text-3xl font-extrabold text-slate-800">Knihovna médií</h1>
                <p class="text-slate-500 mt-1">Spravujte všechny soubory (PDF) pro váš kurz.</p>
            </header>
            <div class="flex-grow overflow-y-auto p-4 md:p-6 lg:p-8">
                <div class="max-w-4xl mx-auto space-y-8">
                    <div class="bg-white p-6 rounded-2xl shadow-lg border border-slate-200">
                        <h2 class="text-xl font-semibold text-slate-800 mb-4">Nahrát nový soubor</h2>
                        <p class="text-slate-500 mb-5 text-sm">Přetáhněte PDF soubor do oblasti níže nebo klikněte pro výběr.</p>
                        <div id="course-media-upload-area" class="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500 cursor-pointer transition-all duration-200 hover:border-green-500 hover:bg-green-50 hover:shadow-inner group">
                             <div class="flex flex-col items-center justify-center space-y-3 pointer-events-none">
                                 <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400 group-hover:text-green-600 transition-colors duration-200"> <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path> <polyline points="17 8 12 3 7 8"></polyline> <line x1="12" y1="3" x2="12" y2="15"></line> </svg>
                                 <p class="font-semibold text-slate-600 group-hover:text-green-700">Přetáhněte soubor sem</p>
                                 <p class="text-xs">nebo</p>
                                 <span class="text-sm font-medium text-green-700">Klikněte pro výběr souboru</span>
                                 <p class="text-xs text-slate-400 mt-1">Podporovaný formát: PDF</p>
                             </div>
                        </div>
                        <input type="file" id="course-media-file-input" multiple class="hidden" accept=".pdf">
                         <div id="upload-progress-container" class="mt-4 space-y-2 hidden">
                            </div>
                    </div>
                    <div class="bg-white p-6 rounded-2xl shadow-lg border border-slate-200">
                         <h2 class="text-xl font-semibold text-slate-800 mb-4">Nahrané soubory</h2>
                        <div id="course-media-list-container"> ${fileListContent}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('professor-media-view', ProfessorMediaView);
