// public/js/views/professor/editor/editor-view-details.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, addDoc, updateDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../../firebase-init.js'; 
import { showToast } from '../../../utils.js';
import { renderSelectedFiles, getSelectedFiles, renderMediaLibraryFiles } from '../../../upload-handler.js';

export class EditorViewDetails extends LitElement {
    static properties = {
        lesson: { type: Object },
        _currentLesson: { state: true, type: Object },
        _isLoading: { state: true, type: Boolean },
    };

    constructor() {
        super();
        this.lesson = null;
        this._currentLesson = null;
        this._isLoading = false;
    }

    createRenderRoot() { return this; }

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson')) {
            this._currentLesson = this.lesson ? { ...this.lesson } : null;
        }
    }

    firstUpdated() {
        // Zobrazíme RAG súbory, ktoré boli načítané v lesson-editor-menu
        renderSelectedFiles();
    }
    
    _openRagModal(e) {
        e.preventDefault();
        const modal = document.getElementById('media-library-modal');
        const modalConfirm = document.getElementById('modal-confirm-btn');
        const modalCancel = document.getElementById('modal-cancel-btn');
        const modalClose = document.getElementById('modal-close-btn');

        if (!modal || !modalConfirm || !modalCancel || !modalClose) {
            console.error("Chybějící elementy pro modální okno.");
            showToast("Chyba: Nepodařilo se načíst komponentu pro výběr souborů.", true);
            return;
        }
        
        const handleConfirm = () => {
           renderSelectedFiles(); 
           closeModal();
        };
        const handleCancel = () => closeModal();
        const closeModal = () => {
           modal.classList.add('hidden');
           modalConfirm.removeEventListener('click', handleConfirm);
           modalCancel.removeEventListener('click', handleCancel);
           modalClose.removeEventListener('click', handleCancel);
        };

        renderMediaLibraryFiles("main-course", "modal-media-list");
        modalConfirm.addEventListener('click', handleConfirm);
        modalCancel.addEventListener('click', handleCancel);
        modalClose.addEventListener('click', handleCancel);
        modal.classList.remove('hidden');
    }

    async _handleSaveLessonDetails(e) {
        e.preventDefault();
        const form = this.querySelector('#lesson-details-form');
        const title = form.querySelector('#lesson-title-input').value.trim();
        if (!title) {
            showToast("Název lekce nemůže být prázdný.", true);
            return;
        }

        const currentSelection = getSelectedFiles(); 
        const lessonData = {
            title: title,
            subtitle: form.querySelector('#lesson-subtitle-input').value.trim(),
            number: form.querySelector('#lesson-number-input').value.trim(),
            icon: form.querySelector('#lesson-icon-input').value.trim() || '🆕',
            ragFilePaths: currentSelection,
            updatedAt: serverTimestamp() 
        };

        this._isLoading = true;
        let updatedLessonData;
        try {
            if (this._currentLesson && this._currentLesson.id) {
                // Aktualizácia
                await updateDoc(doc(firebaseInit.db, 'lessons', this._currentLesson.id), lessonData);
                updatedLessonData = { ...this._currentLesson, ...lessonData };
                showToast("Detaily lekce byly úspěšně aktualizovány.");
            } else {
                // Vytvorenie
                lessonData.createdAt = serverTimestamp(); 
                const docRef = await addDoc(collection(firebaseInit.db, 'lessons'), lessonData);
                updatedLessonData = { id: docRef.id, ...lessonData };
                showToast("Nová lekce byla úspěšně vytvořena.");
            }
            
            this._currentLesson = updatedLessonData;
            // Oznámime rodičovi (lesson-editor -> professor-app), že sa lekcia zmenila
            this.dispatchEvent(new CustomEvent('lesson-updated', { 
                detail: updatedLessonData, 
                bubbles: true, 
                composed: true 
            }));

        } catch (error) {
            console.error("Error saving lesson details:", error);
            showToast("Při ukládání detailů lekce došlo k chybě.", true);
        } finally {
            this._isLoading = false;
        }
    }

    render() {
        return html`
            <div class="flex justify-between items-start mb-6">
                <h2 class="text-3xl font-extrabold text-slate-800">Detaily lekce</h2>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-lg">
                <form id="lesson-details-form" class="space-y-4" @submit=${this._handleSaveLessonDetails}>
                    <div>
                        <label class="block font-medium text-slate-600">Název lekce</label>
                        <input type="text" id="lesson-title-input" class="w-full border-slate-300 rounded-lg p-2 mt-1 focus:ring-green-500 focus:border-green-500" value="${this._currentLesson?.title || ''}" placeholder="Např. Úvod do organické chemie">
                    </div>
                    <div>
                        <label class="block font-medium text-slate-600">Podtitulek</label>
                        <input type="text" id="lesson-subtitle-input" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="${this._currentLesson?.subtitle || ''}" placeholder="Základní pojmy a principy">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block font-medium text-slate-600">Číslo lekce</label>
                            <input type="text" id="lesson-number-input" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="${this._currentLesson?.number || ''}" placeholder="Např. 101">
                        </div>
                        <div>
                            <label class="block font-medium text-slate-600">Ikona</label>
                            <input type="text" id="lesson-icon-input" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="${this._currentLesson?.icon || '🆕'}" placeholder="🆕">
                        </div>
                    </div>

                    <div class="mb-4">
                        <label class="block font-medium text-slate-600 mb-2">Vyberte kontextové dokumenty (RAG):</label>
                        <div class="space-y-2 border rounded-lg p-3 bg-slate-50">
                            <ul id="selected-files-list-rag" class="text-xs text-slate-600 mb-2 list-disc list-inside">
                                <li>Žádné soubory nevybrány.</li>
                            </ul>
                            <button @click=${this._openRagModal} class="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-1 px-2 rounded-md">
                                Vybrat soubory z knihovny
                            </button>
                        </div>
                        <p class="text-xs text-slate-400 mt-1">Vybrané dokumenty budou uloženy spolu s lekcí.</p>
                    </div>
                    
                    <div class="text-right pt-4">
                        <button type="submit" id="save-lesson-btn" ?disabled=${this._isLoading} class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105">
                            ${this._isLoading ? html`<div class="spinner"></div>` : 'Uložit změny'}
                        </button>
                    </div>
                </form>
            </div>
        `;
    }
}

customElements.define('editor-view-details', EditorViewDetails);
