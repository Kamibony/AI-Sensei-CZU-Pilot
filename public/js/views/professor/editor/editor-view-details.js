// public/js/views/professor/editor/editor-view-details.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, addDoc, updateDoc, collection, serverTimestamp, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../../firebase-init.js';
import { showToast } from '../../../utils.js';
import { Localized } from '../../../utils/localization-mixin.js';
// === OPRAVENÝ IMPORT: Pridali sme loadSelectedFiles ===
import { renderSelectedFiles, getSelectedFiles, renderMediaLibraryFiles, loadSelectedFiles } from '../../../upload-handler.js';

// Štýly tlačidiel
const btnBase = "px-5 py-2 font-semibold rounded-lg transition transform hover:scale-105 disabled:opacity-50 disabled:scale-100 flex items-center justify-center";
const btnPrimary = `${btnBase} bg-green-700 text-white hover:bg-green-800`;
const btnSecondary = `${btnBase} bg-slate-200 text-slate-700 hover:bg-slate-300`;

export class EditorViewDetails extends Localized(LitElement) {
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
            showToast(this.t('editor.details.groups_load_error'), true);
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
        if (!modal || !modalConfirm || !modalCancel || !modalClose) { console.error("Chybějící elementy pro modální okno."); showToast(this.t('editor.details.files_comp_error'), true); return; }
        
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

    // The save logic is primarily handled by the parent LessonEditor in the new Wizard flow.
    // However, we keep this method and button (hidden) if legacy code or direct submission is triggered.
    // We expose the internal validation/save logic if needed via 'saveLesson' public method.

    getDetails() {
        const form = this.querySelector('#lesson-details-form');
        if (!form) return {};

        const title = form.querySelector('#lesson-title-input')?.value.trim() || '';
        const subtitle = form.querySelector('#lesson-subtitle-input')?.value.trim() || '';
        const number = form.querySelector('#lesson-number-input')?.value.trim() || '';
        const icon = form.querySelector('#lesson-icon-input')?.value.trim() || '🆕';
        const assignedToGroups = Array.from(form.querySelectorAll('input[name="group-assignment"]:checked')).map(cb => cb.value);

        return { title, subtitle, number, icon, assignedToGroups };
    }

    async _handleSaveLessonDetails(e) {
        if(e) e.preventDefault();
        // This logic is now largely duplicated in LessonEditor._handleSaveLesson
        // Keeping it for backward compatibility if this component is used standalone.
        // ...
    }

    render() {
        return html`
            <div class="flex justify-between items-start mb-6">
                <h2 class="text-3xl font-extrabold text-slate-800">${this.t('editor.hub_edit_details')}</h2>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-lg">
                <form id="lesson-details-form" class="space-y-4" @submit=${this._handleSaveLessonDetails}>
                    <div>
                        <label class="block font-medium text-slate-600">${this.t('lesson.title')}</label>
                        <input type="text" id="lesson-title-input" class="w-full border-slate-300 rounded-lg p-2 mt-1 focus:ring-green-500 focus:border-green-500" .value="${this.lesson?.title || ''}" placeholder="${this.t('editor.details.title_placeholder')}">
                    </div>
                    <div>
                        <label class="block font-medium text-slate-600">${this.t('professor.editor.subtitle')}</label>
                        <input type="text" id="lesson-subtitle-input" class="w-full border-slate-300 rounded-lg p-2 mt-1" .value="${this.lesson?.subtitle || ''}" placeholder="${this.t('editor.details.subtitle_placeholder')}">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block font-medium text-slate-600">ID / ${this.t('common.id')}</label>
                            <input type="text" id="lesson-number-input" class="w-full border-slate-300 rounded-lg p-2 mt-1" .value="${this.lesson?.number || ''}" placeholder="${this.t('editor.details.number_placeholder')}">
                        </div>
                        <div>
                            <label class="block font-medium text-slate-600">Icon</label>
                            <input type="text" id="lesson-icon-input" class="w-full border-slate-300 rounded-lg p-2 mt-1" .value="${this.lesson?.icon || '🆕'}" placeholder="🆕">
                        </div>
                    </div>
                    <!-- RAG File selection moved to Lesson Editor Step 1 -->

                    <div class="mb-4">
                        <label class="block font-medium text-slate-600 mb-2">${this.t('professor.editor.classAssignment')}</label>
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
                                <p class="text-xs text-slate-500">${this.t('editor.details.no_classes')}</p>
                            `}
                        </div>
                    </div>

                    <!--
                        Updated: The main save button is now in the parent Wizard (Step 3).
                        We hide this one but keep it in DOM to satisfy constraints/references if any.
                        Use display:none style.
                    -->
                    <div class="text-right pt-4 hidden">
                        <button type="submit" id="save-lesson-btn" ?disabled=${this._isLoading} class="${btnPrimary} px-6">
                            ${this._isLoading ? html`<div class="spinner"></div><span class="ml-2">${this.t('common.loading')}</span>` : this.t('common.save')}
                        </button>
                    </div>
                </form>
            </div>
        `;
    }
}

customElements.define('editor-view-details', EditorViewDetails);
