// public/js/views/professor/lesson-library.js
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, getDocs, doc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';

export class LessonLibrary extends LitElement {
    static properties = {
        lessonsData: { state: true, type: Array },
    };

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
            return true;
        } catch (error) {
            console.error("Error fetching lessons for library: ", error);
            showToast("Nepodařilo se načíst data lekcí.", true);
            return false;
        }
    }

    _handleLessonClick(lessonId) {
        const selectedLesson = this.lessonsData.find(l => l.id === lessonId);
        this.dispatchEvent(new CustomEvent('lesson-selected', { 
            detail: selectedLesson, 
            bubbles: true, 
            composed: true 
        }));
    }

    async _handleDeleteClick(e, lessonId) {
        e.stopPropagation();
        const lessonToDelete = this.lessonsData.find(l => l.id === lessonId);
        if (confirm(`Opravdu chcete trvale smazat lekci "${lessonToDelete.title}"? Tato akce je nevratná.`)) {
            try {
                await deleteDoc(doc(firebaseInit.db, 'lessons', lessonId));
                showToast('Lekce byla smazána.');
                this.fetchLessons(); // Znovu načítame lekcie
            } catch (error) {
                console.error("Error deleting lesson:", error);
                showToast("Chyba při mazání lekce.", true);
            }
        }
    }

    _handleAddNewClick() {
        this.dispatchEvent(new CustomEvent('add-new-lesson', { 
            bubbles: true, 
            composed: true 
        }));
    }

    firstUpdated() {
        const listEl = this.shadowRoot.querySelector('#lesson-list-container');
        if (listEl && typeof Sortable !== 'undefined') {
            new Sortable(listEl, {
                group: { name: 'lessons', pull: 'clone', put: false },
                animation: 150,
                sort: false,
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
                            <div>
                                <h3 class="font-semibold text-slate-800">${lesson.title}</h3>
                                <p class="text-sm text-slate-500">${lesson.subtitle || ' '}</p>
                            </div>
                            <button class="delete-lesson-btn p-1 rounded-full text-slate-400 hover:bg-red-200 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity" 
                                    data-lesson-id="${lesson.id}" 
                                    title="Smazat lekci"
                                    @click=${(e) => this._handleDeleteClick(e, lesson.id)}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2 2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </div>
                `)}
            </div>
            <footer class="p-4 border-t border-slate-200 flex-shrink-0">
                <button id="add-new-lesson-btn" class="w-full p-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800"
                        @click=${this._handleAddNewClick}>
                    Přidat novou lekci
                </button>
            </footer>
        `;
    }

    static styles = css`
        :host {
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 100%;
            background-color: #f1f5f9; /* bg-slate-100 */
        }
        /* Štýly pre scrollbar, ak je potrebný */
        .flex-grow {
            flex: 1 1 auto;
        }
    `;
}

customElements.define('lesson-library', LessonLibrary);
