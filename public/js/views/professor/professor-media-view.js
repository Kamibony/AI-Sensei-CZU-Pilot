// public/js/views/professor/professor-media-view.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { auth } from '../../firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeCourseMediaUpload } from '../../upload-handler.js';
import * as firebaseInit from '../../firebase-init.js';
import { storage } from '../../firebase-init.js';
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { collection, query, where, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from '../../utils.js';
import { Localized } from '../../utils/localization-mixin.js';

export class ProfessorMediaView extends Localized(LitElement) {
    static properties = {
        _files: { state: true, type: Array },
        _isLoading: { state: true, type: Boolean },
        _isAuthReady: { state: true, type: Boolean },
    };

    constructor() {
        super();
        this._files = [];
        this._isLoading = true;
        this._isAuthReady = false;
    }

    createRenderRoot() {
        return this; // Light DOM
    }

    connectedCallback() {
        super.connectedCallback();

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log('Auth state confirmed, loading media files...');
                this._isAuthReady = true;
                this._loadFiles();
                unsubscribe();
            } else {
                console.error('User is not authenticated. Cannot load media files.');
                this.errorMessage = this.t('media.login_required');
                this._isAuthReady = false;
                this.loading = false;
                unsubscribe();
            }
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
    }

    firstUpdated() {
        initializeCourseMediaUpload("main-course", this._loadFiles.bind(this), this);
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

            let filesQuery;
            if (user.email === 'profesor@profesor.cz') {
                filesQuery = query(collection(firebaseInit.db, "fileMetadata"), where("courseId", "==", "main-course"));
            } else {
                filesQuery = query(collection(firebaseInit.db, "fileMetadata"),
                    where("courseId", "==", "main-course"),
                    where("ownerId", "==", user.uid)
                );
            }

            const querySnapshot = await getDocs(filesQuery);
            const files = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, name: doc.data().fileName, fullPath: doc.data().storagePath }));

            this._files = files.sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            console.error("Error loading media files from Firestore:", error);
            showToast(this.t('media.fetch_error'), true);
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

    async _deleteFile(e, file) {
        e.stopPropagation(); // Prevent card click if we add one later
        if (!confirm(this.t('media.delete_confirm', { name: file.name }))) return;

        try {
            const fileRef = ref(storage, file.fullPath);
            await deleteObject(fileRef);
        } catch (error) {
            if (error.code === 'storage/object-not-found') {
                console.warn(`File not found in Storage, proceeding to delete Firestore record: ${file.fullPath}`);
            } else {
                console.error("Error deleting file from Storage:", error);
            }
        }

        try {
            await deleteDoc(doc(firebaseInit.db, "fileMetadata", file.id));
            showToast(this.t('media.delete_success', { name: file.name }));
            this._files = this._files.filter(f => f.id !== file.id);
        } catch (error) {
            console.error("Critical error: Failed to delete file metadata from Firestore:", error);
            showToast(`${this.t('media.delete_error')}: ${error.message}`, true);
        }
    }

    render() {
        let fileListContent;
        if (this._isLoading) {
            fileListContent = html`
                <div class="flex justify-center items-center h-40 col-span-full">
                    <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                </div>`;
        } else if (this._files.length === 0) {
            fileListContent = html`
                <div class="col-span-full text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                    <p class="text-slate-500">${this.t('media.no_files')}</p>
                </div>`;
        } else {
            fileListContent = html`
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    ${this._files.map(file => html`
                        <div class="aspect-square flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-lg transition-all relative group p-4 text-center cursor-default">

                            <!-- Icon -->
                            <div class="w-16 h-16 mb-3 text-red-500 bg-red-50 rounded-xl flex items-center justify-center shadow-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            </div>

                            <!-- Filename -->
                            <p class="text-sm font-semibold text-slate-700 w-full truncate px-2" title="${file.name}">${file.name}</p>
                            <p class="text-xs text-slate-400 mt-1">${this._formatFileSize(file.size)}</p>

                            <!-- Hover Action: Delete -->
                            <button @click=${(e) => this._deleteFile(e, file)}
                                    class="absolute top-2 right-2 p-2 rounded-full bg-white text-slate-400 hover:text-red-600 hover:bg-red-50 shadow-sm border border-slate-100 opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100"
                                    title="${this.t('media.delete_tooltip')}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    `)}
                </div>
            `;
        }

        return html`
            <div class="h-full flex flex-col bg-slate-50">
                <header class="bg-white p-6 border-b border-slate-200">
                     <div class="w-full text-center">
                        <h1 class="text-3xl font-extrabold text-slate-800 tracking-tight">${this.t('media.title')}</h1>
                        <p class="text-slate-500 mt-1 font-medium">${this.t('media.subtitle')}</p>
                    </div>
                </header>

                <div class="flex-grow overflow-y-auto p-6">
                    <div class="w-full px-6 space-y-8">

                        <!-- Upload Area -->
                        <div class="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                            <div id="course-media-upload-area"
                                 class="border-3 border-dashed border-slate-300 rounded-2xl p-12 text-center transition-all duration-200
                                        ${this._isAuthReady
                                            ? 'cursor-pointer hover:border-indigo-500 hover:bg-indigo-50/30 group'
                                            : 'cursor-not-allowed bg-slate-50 opacity-60'}"
                                 ?disabled=${!this._isAuthReady}>

                                 <div class="flex flex-col items-center justify-center space-y-4 pointer-events-none">
                                     <div class="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform duration-300">
                                         <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-indigo-500"> <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path> <polyline points="17 8 12 3 7 8"></polyline> <line x1="12" y1="3" x2="12" y2="15"></line> </svg>
                                     </div>
                                     <div>
                                         <p class="text-xl font-bold text-slate-700 group-hover:text-indigo-600 transition-colors">${this.t('media.drag_drop')}</p>
                                         <p class="text-slate-400 mt-1">${this.t('media.click_to_select')}</p>
                                     </div>
                                     <div class="pt-2">
                                        <span class="px-3 py-1 rounded-full bg-slate-100 text-xs font-medium text-slate-500 border border-slate-200">PDF</span>
                                     </div>
                                 </div>
                            </div>
                            <input type="file" id="course-media-file-input" multiple class="hidden" accept=".pdf">
                            <div id="upload-progress-container" class="mt-6 space-y-3 hidden">
                                <!-- Progress bars will be injected here by upload-handler.js -->
                            </div>
                        </div>

                        <!-- Files Grid -->
                        <div>
                             <h2 class="text-xl font-bold text-slate-800 mb-6 flex items-center">
                                <svg class="w-6 h-6 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                                ${this.t('media.uploaded_files')} <span class="ml-2 bg-slate-100 text-slate-600 text-sm py-0.5 px-2 rounded-full font-medium">${this._files.length}</span>
                             </h2>
                             <div id="course-media-list-container">
                                ${fileListContent}
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('professor-media-view', ProfessorMediaView);
