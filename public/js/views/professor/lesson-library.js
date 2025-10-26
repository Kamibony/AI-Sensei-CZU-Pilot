// public/js/views/professor/lesson-library.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, getDocs, doc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';

// === Definícia Štýlov Tlačidiel ===
const btnBase = "font-semibold rounded-lg transition transform hover:scale-105 disabled:opacity-50 disabled:scale-100 flex items-center justify-center";
const btnPrimary = `${btnBase} bg-green-700 text-white hover:bg-green-800 p-3 w-full`; // Pridať novú lekciu
const btnIconDestructive = `p-1 rounded-full text-slate-400 hover:bg-red-200 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity`; // Smazat ikona
// ===================================

export class LessonLibrary extends LitElement {
    static properties = {
        lessonsData: { state: true, type: Array },
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this.lessonsData = [];
    }

    connectedCallback() {
        super.connectedCallback();
        this.fetchLessons();
    }

    async fetchLessons() {
        try {
            const lessonsCollection = collection(firebaseInit.db, 'lessons');
            const querySnapshot = await getDocs(query(lessonsCollection, orderBy("createdAt")));
            this.lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching lessons for library: ", error);
            showToast("Nepodařilo se načíst data lekcí.", true);
        }
    }

    _handleLessonClick(lessonId) {
        const selectedLesson = this.lessonsData.find(l => l.id === lessonId);
        this.dispatchEvent(new CustomEvent('lesson-selected', { detail: selectedLesson, bubbles: true, composed: true }));
    }

    async _handleDeleteClick(e, lessonId) {
        e.stopPropagation();
        const lessonToDelete = this.lessonsData.find(l => l.id === lessonId);
        if (confirm(`Opravdu chcete trvale smazat lekci "${lessonToDelete.title}"? Tato akce je nevratná.`)) {
            try {
                await deleteDoc(doc(firebaseInit.db, 'lessons', lessonId));
                showToast('Lekce byla smazána.');
                this.fetchLessons();
            } catch (error) {
                console.error("Error deleting lesson:", error);
                showToast("Chyba při mazání lekce.", true);
            }
        }
    }

    _handleAddNewClick() {
        this.dispatchEvent(new CustomEvent('add-new-lesson', { bubbles: true, composed: true }));
    }

    firstUpdated() {
        const listEl = this.querySelector('#lesson-list-container');
        if (listEl && typeof Sortable !== 'undefined') {
            new Sortable(listEl, {
                group: { name: 'lessons', pull: 'clone', put: false }, animation: 150, sort: false,
            });
        }
    }

    render() {
        return html`
            <header class="p-4 border-b border-slate-200 flex-shrink-0">
                <h2 class="text-xl font-bold text-slate-800">Knihovna lekcí</h2>
            </header>
            <div class="flex-grow overflow-y-auto p-4" id="lesson-list-container">
                ${this.lessonsData.map(lesson => html`
                    <div class="lesson-bubble-wrapper group p-1" data-lesson-id="${lesson.id}">
                        <div class="lesson-bubble-in-library p-4 bg-white border rounded-lg cursor-pointer hover:shadow-md flex justify-between items-center"
                             @click=${() => this._handleLessonClick(lesson.id)}>
                            <div class="min-w-0 flex-grow mr-2"> <h3 class="font-semibold text-slate-800 truncate" title="${lesson.title}">${lesson.title}</h3>
                                <p class="text-sm text-slate-500 truncate" title="${lesson.subtitle || ''}">${lesson.subtitle || ' '}</p>
                            </div>
                            <button class="delete-lesson-btn ${btnIconDestructive} flex-shrink-0" data-lesson-id="${lesson.id}"
                                    title="Smazat lekci"
                                    @click=${(e) => this._handleDeleteClick(e, lesson.id)}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2 2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </div>
                `)}
                 ${this.lessonsData.length === 0 ? html`<p class="text-center text-slate-500 p-4">Zatím žádné lekce.</p>`: ''}
            </div>
            <footer class="p-4 border-t border-slate-200 flex-shrink-0">
                <button id="add-new-lesson-btn" class="${btnPrimary}" @click=${this._handleAddNewClick}> Přidat novou lekci
                </button>
            </footer>
        `;
    }
}
customElements.define('lesson-library', LessonLibrary);
