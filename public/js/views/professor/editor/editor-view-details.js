// public/js/views/professor/editor/editor-view-details.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, addDoc, updateDoc, collection, serverTimestamp, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../../firebase-init.js';
import { showToast } from '../../../utils.js';
// === OPRAVENÝ IMPORT: Pridali sme loadSelectedFiles ===
import { renderSelectedFiles, getSelectedFiles, renderMediaLibraryFiles, loadSelectedFiles } from '../../../upload-handler.js';

// Štýly tlačidiel
const btnBase = "px-5 py-2 font-semibold rounded-lg transition transform hover:scale-105 disabled:opacity-50 disabled:scale-100 flex items-center justify-center";
const btnPrimary = `${btnBase} bg-green-700 text-white hover:bg-green-800`;
const btnSecondary = `${btnBase} bg-slate-200 text-slate-700 hover:bg-slate-300`;

export class EditorViewDetails extends LitElement {
    static properties = {
        lesson: { type: Object },
        _isLoading: { state: true, type: Boolean },
        _groups: { state: true, type: Array },
    };

    constructor() {
        super();
        this.lesson = null;
        this._isLoading = false;
        this._groups = [];
    }

    connectedCallback() {
        super.connectedCallback();
        this._fetchGroups();
    }

    async _fetchGroups() {
        const currentUser = firebaseInit.auth.currentUser;
        if (!currentUser) return;

        try {
            const groupsQuery = query(
                collection(firebaseInit.db, "groups"),
                where("ownerId", "==", currentUser.uid)
            );
            const querySnapshot = await getDocs(groupsQuery);
            this._groups = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching groups:", error);
            showToast("Nepodařilo se načíst skupiny.", true);
        }
    }

    createRenderRoot() { return this; }

    // === ZMENA: updated() namiesto firstUpdated() pre RAG ===
    updated(changedProperties) {
        // Vždy keď sa komponent prekreslí A existuje this.lesson, vykreslíme RAG zoznam
        if (this.lesson && (changedProperties.has('lesson') || !changedProperties.has('lesson')) ) {
             // Timeout zabezpečí, že sa to spustí až po renderovaní DOMu
            setTimeout(() => {
                 // Načítame a hneď aj renderujeme pre prípad, že dáta prišli neskoro
                 // Toto je bezpečné, lebo sa volá v updated()
                 loadSelectedFiles(this.lesson?.ragFilePaths || []);
                 renderSelectedFiles(`selected-files-list-rag-details`); // Použijeme unikátne ID
            }, 0);
        }
    }


    // === OPRAVENÁ FUNKCIA: Pridané volanie loadSelectedFiles ===
    _openRagModal(e) {
        e.preventDefault();
        const modal = document.getElementById('media-library-modal');
        const modalConfirm = document.getElementById('modal-confirm-btn');
        const modalCancel = document.getElementById('modal-cancel-btn');
        const modalClose = document.getElementById('modal-close-btn');
        if (!modal || !modalConfirm || !modalCancel || !modalClose) { console.error("Chybějící elementy pro modální okno."); showToast("Chyba: Nepodařilo se načíst komponentu pro výběr souborů.", true); return; }
        
        // *** OPRAVA: Načítame aktuálne súbory pre TÚTO LEKCIU do globálneho stavu ***
        loadSelectedFiles(this.lesson?.ragFilePaths || []);
        // *** KONIEC OPRAVY ***
        
        const handleConfirm = () => {
             renderSelectedFiles(`selected-files-list-rag-details`); // Vykreslíme RAG pre tento panel
             closeModal();
        };
        const handleCancel = () => closeModal();
        const closeModal = () => { modal.classList.add('hidden'); modalConfirm.removeEventListener('click', handleConfirm); modalCancel.removeEventListener('click', handleCancel); modalClose.removeEventListener('click', handleCancel); };
        
        // Musí byť volané až PO loadSelectedFiles, aby sa správne označili checkboxy
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
        const selectedGroups = Array.from(form.querySelectorAll('input[name="group-assignment"]:checked')).map(checkbox => checkbox.value);

        const lessonData = {
            title: title,
            subtitle: form.querySelector('#lesson-subtitle-input').value.trim(),
            number: form.querySelector('#lesson-number-input').value.trim(),
            icon: form.querySelector('#lesson-icon-input').value.trim() || '🆕',
            ragFilePaths: currentSelection,
            assignedToGroups: selectedGroups,
            updatedAt: serverTimestamp()
        };

        this._isLoading = true; let updatedLessonData;
        try {
            if (this.lesson?.id) { // Používame this.lesson
                if (!this.lesson.ownerId) {
                    lessonData.ownerId = firebaseInit.auth.currentUser.uid;
                }
                await updateDoc(doc(firebaseInit.db, 'lessons', this.lesson.id), lessonData);
                updatedLessonData = { ...this.lesson, ...lessonData };
                showToast("Detaily lekce byly úspěšně aktualizovány.");
            } else {
                lessonData.createdAt = serverTimestamp();
                lessonData.ownerId = firebaseInit.auth.currentUser.uid;
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
                        <input type="text" id="lesson-title-input" class="w-full border-slate-300 rounded-lg p-2 mt-1 focus:ring-green-500 focus:border-green-500" .value="${this.lesson?.title || ''}" placeholder="Např. Úvod do organické chemie">
                    </div>
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
                            <button @click=${this._openRagModal} type="button" class="text-sm ${btnSecondary} px-2 py-1"> Vybrat soubory z knihovny
                            </button>
                        </div>
                        <p class="text-xs text-slate-400 mt-1">Vybrané dokumenty budou uloženy spolu s lekcí.</p>
                    </div>

                    <div class="mb-4">
                        <label class="block font-medium text-slate-600 mb-2">Přiřadit do tříd:</label>
                        <div class="space-y-2 border rounded-lg p-3 bg-slate-50">
                            ${this._groups.length > 0 ? this._groups.map(group => html`
                                <div class="flex items-center">
                                    <input type="checkbox"
                                           id="group-${group.id}"
                                           name="group-assignment"
                                           value="${group.id}"
                                           .checked=${this.lesson?.assignedToGroups?.includes(group.id) || false}
                                           class="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500">
                                    <label for="group-${group.id}" class="ml-3 text-sm text-gray-700">${group.name}</label>
                                </div>
                            `) : html`
                                <p class="text-xs text-slate-500">Zatím nemáte vytvořené žádné třídy.</p>
                            `}
                        </div>
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
