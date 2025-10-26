// public/js/views/professor/editor/editor-view-details.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, addDoc, updateDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../../firebase-init.js';
import { showToast } from '../../../utils.js';
// Zmenili sme import, nepotrebujeme loadSelectedFiles
import { renderSelectedFiles, getSelectedFiles, renderMediaLibraryFiles } from '../../../upload-handler.js';

// Štýly tlačidiel
const btnBase = "px-5 py-2 font-semibold rounded-lg transition transform hover:scale-105 disabled:opacity-50 disabled:scale-100 flex items-center justify-center";
const btnPrimary = `${btnBase} bg-green-700 text-white hover:bg-green-800`;
const btnSecondary = `${btnBase} bg-slate-200 text-slate-700 hover:bg-slate-300`;

export class EditorViewDetails extends LitElement {
    static properties = {
        lesson: { type: Object }, // Prijímame priamo
        // Odstránili sme _currentLesson
        // _currentLesson: { state: true, type: Object },
        _isLoading: { state: true, type: Boolean },
    };

    constructor() {
        super();
        this.lesson = null;
        // this._currentLesson = null; // Odstránené
        this._isLoading = false;
    }

    createRenderRoot() { return this; }

    // === ZMENA: updated() namiesto firstUpdated() pre RAG ===
    updated(changedProperties) {
        // Vždy keď sa komponent prekreslí (aj pri zmene lekcie), vykreslíme RAG zoznam
        if (changedProperties.has('lesson')) {
             renderSelectedFiles(`selected-files-list-rag-details`); // Použijeme unikátne ID
        }
    }
    // willUpdate a firstUpdated pre RAG boli odstránené


    _openRagModal(e) { /* ... kód zostáva rovnaký ... */
        e.preventDefault();
        const modal = document.getElementById('media-library-modal');
        const modalConfirm = document.getElementById('modal-confirm-btn');
        const modalCancel = document.getElementById('modal-cancel-btn');
        const modalClose = document.getElementById('modal-close-btn');
        if (!modal || !modalConfirm || !modalCancel || !modalClose) { console.error("Chybějící elementy pro modální okno."); showToast("Chyba: Nepodařilo se načíst komponentu pro výběr souborů.", true); return; }
        const handleConfirm = () => {
             renderSelectedFiles(`selected-files-list-rag-details`); // Vykreslíme RAG pre tento panel
             closeModal();
        };
        const handleCancel = () => closeModal();
        const closeModal = () => { modal.classList.add('hidden'); modalConfirm.removeEventListener('click', handleConfirm); modalCancel.removeEventListener('click', handleCancel); modalClose.removeEventListener('click', handleCancel); };
        renderMediaLibraryFiles("main-course", "modal-media-list");
        modalConfirm.addEventListener('click', handleConfirm); modalCancel.addEventListener('click', handleCancel); modalClose.addEventListener('click', handleCancel);
        modal.classList.remove('hidden');
    }

    // Ukladanie (používa this.lesson)
    async _handleSaveLessonDetails(e) {
        e.preventDefault();
        const form = this.querySelector('#lesson-details-form');
        const title = form.querySelector('#lesson-title-input').value.trim();
        if (!title) { showToast("Název lekce nemůže být prázdný.", true); return; }

        const currentSelection = getSelectedFiles();
        const lessonData = {
            title: title,
            subtitle: form.querySelector('#lesson-subtitle-input').value.trim(),
            number: form.querySelector('#lesson-number-input').value.trim(),
            icon: form.querySelector('#lesson-icon-input').value.trim() || '🆕',
            ragFilePaths: currentSelection,
            updatedAt: serverTimestamp()
        };

        this._isLoading = true; let updatedLessonData;
        try {
            if (this.lesson?.id) { // Používame this.lesson
                await updateDoc(doc(firebaseInit.db, 'lessons', this.lesson.id), lessonData);
                updatedLessonData = { ...this.lesson, ...lessonData };
                showToast("Detaily lekce byly úspěšně aktualizovány.");
            } else {
                lessonData.createdAt = serverTimestamp();
                const docRef = await addDoc(collection(firebaseInit.db, 'lessons'), lessonData);
                updatedLessonData = { id: docRef.id, ...lessonData };
                showToast("Nová lekce byla úspěšně vytvořena.");
            }
            // Pošleme udalosť s novými dátami lekcie
            this.dispatchEvent(new CustomEvent('lesson-updated', { detail: updatedLessonData, bubbles: true, composed: true }));
        } catch (error) { console.error("Error saving lesson details:", error); showToast("Při ukládání detailů lekce došlo k chybě.", true); }
        finally { this._isLoading = false; }
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
                        <input type="text" id="lesson-title-input" class="w-full border-slate-300 rounded-lg p-2 mt-1 focus:ring-green-500 focus:border-green-500" .value="${this.lesson?.title || ''}" placeholder="Např. Úvod do organické chemie"> </div>
                    <div>
                        <label class="block font-medium text-slate-600">Podtitulek</label>
                        <input type="text" id="lesson-subtitle-input" class="w-full border-slate-300 rounded-lg p-2 mt-1" .value="${this.lesson?.subtitle || ''}" placeholder="Základní pojmy a principy">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block font-medium text-slate-600">Číslo lekce</label>
                            <input type="text" id="lesson-number-input" class="w-full border-slate-300 rounded-lg p-2 mt-1" .value="${this.lesson?.number || ''}" placeholder="Např. 101">
                        </div>
                        <div>
                            <label class="block font-medium text-slate-600">Ikona</label>
                            <input type="text" id="lesson-icon-input" class="w-full border-slate-300 rounded-lg p-2 mt-1" .value="${this.lesson?.icon || '🆕'}" placeholder="🆕">
                        </div>
                    </div>
                    <div class="mb-4">
                        <label class="block font-medium text-slate-600 mb-2">Vyberte kontextové dokumenty (RAG):</label>
                        <div class="space-y-2 border rounded-lg p-3 bg-slate-50">
                             <ul id="selected-files-list-rag-details" class="text-xs text-slate-600 mb-2 list-disc list-inside">
                                <li>Žádné soubory nevybrány.</li>
                            </ul>
                            <button @click=${this._openRagModal} class="text-sm ${btnSecondary} px-2 py-1">
                                Vybrat soubory z knihovny
                            </button>
                        </div>
                        <p class="text-xs text-slate-400 mt-1">Vybrané dokumenty budou uloženy spolu s lekcí.</p>
                    </div>
                    <div class="text-right pt-4">
                        <button type="submit" id="save-lesson-btn" ?disabled=${this._isLoading} class="${btnPrimary} px-6">
                            ${this._isLoading ? html`<div class="spinner"></div><span class="ml-2">Ukládám...</span>` : 'Uložit změny'}
                        </button>
                    </div>
                </form>
            </div>
        `;
    }
}

customElements.define('editor-view-details', EditorViewDetails);
