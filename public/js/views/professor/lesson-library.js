import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, getDocs, doc, deleteDoc, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';
import { Localized } from '../../utils/localization-mixin.js';

// === Štýly ===
const btnBase = "font-semibold rounded-lg transition transform hover:scale-105 disabled:opacity-50 disabled:scale-100 flex items-center justify-center";
const btnPrimary = `${btnBase} bg-green-700 text-white hover:bg-green-800 p-3 w-full`;
const btnIconDestructive = `p-1 rounded-full text-slate-400 hover:bg-red-200 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity`;
// Nový štýl pre tlačidlo "+"
const btnAddTimeline = `absolute top-2 right-2 p-1.5 bg-green-100 text-green-700 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-green-200 hover:scale-110 shadow-sm z-10`;

export class LessonLibrary extends Localized(LitElement) {
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
            const currentUser = firebaseInit.auth.currentUser;
            if (!currentUser) {
                this.lessonsData = [];
                return;
            }
            const lessonsCollection = collection(firebaseInit.db, 'lessons');
            let q;
            if (currentUser.email === 'profesor@profesor.cz') {
                q = query(lessonsCollection, orderBy("createdAt"));
            } else {
                q = query(
                    lessonsCollection,
                    where("ownerId", "==", currentUser.uid),
                    orderBy("createdAt")
                );
            }
            const querySnapshot = await getDocs(q);
            this.lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching lessons for library: ", error);
            showToast(this.t('library.error_loading') || "Nepodařilo se načíst data lekcí.", true);
        }
    }

    _handleLessonClick(lessonId) {
        const selectedLesson = this.lessonsData.find(l => l.id === lessonId);
        this.dispatchEvent(new CustomEvent('lesson-selected', { detail: selectedLesson, bubbles: true, composed: true }));
    }

    async _handleDeleteClick(e, lessonId) {
        e.stopPropagation();
        const lessonToDelete = this.lessonsData.find(l => l.id === lessonId);
        
        // Použitie prekladu s parametrom, alebo fallback
        const confirmMsg = this.t('library.confirm_delete_title', { title: lessonToDelete.title }) 
                           || `Opravdu chcete trvale smazat lekci "${lessonToDelete.title}"? Tato akce je nevratná.`;

        if (confirm(confirmMsg)) {
            try {
                await deleteDoc(doc(firebaseInit.db, 'lessons', lessonId));
                showToast(this.t('library.deleted_success') || 'Lekce byla smazána.');
                this.fetchLessons();
            } catch (error) {
                console.error("Error deleting lesson:", error);
                showToast(this.t('library.delete_error') || "Chyba při mazání lekce.", true);
            }
        }
    }

    _handleAddNewClick() {
        this.dispatchEvent(new CustomEvent('add-new-lesson', { bubbles: true, composed: true }));
    }

    // Handler pre kliknutie na "+"
    _handleAddToTimelineClick(e, lesson) {
        e.stopPropagation(); // Zabráni otvoreniu editora
        // Vyvoláme globálny event, ktorý zachytí ProfessorApp
        document.dispatchEvent(new CustomEvent('add-lesson-to-timeline', { detail: lesson }));
        
        // Vizuálna spätná väzba
        const btn = e.currentTarget;
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>`;
        setTimeout(() => {
            btn.innerHTML = originalHTML;
        }, 1500);
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
            <header class="p-4 border-b border-slate-200 flex-shrink-0 bg-slate-50 sticky top-0 z-10">
                <h2 class="text-xl font-bold text-slate-800">${this.t('professor.lesson_library')}</h2>
            </header>
            <div class="flex-grow overflow-y-auto p-4" id="lesson-list-container">
                ${this.lessonsData.map(lesson => html`
                    <div class="lesson-bubble-wrapper group relative p-1" data-lesson-id="${lesson.id}">
                        <button class="${btnAddTimeline}" 
                                title="${this.t('timeline.add_to_timeline_tooltip') || 'Pridať na koniec timeline'}"
                                @click=${(e) => this._handleAddToTimelineClick(e, lesson)}>
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
                            </svg>
                        </button>

                        <div class="lesson-bubble-in-library p-4 bg-white border rounded-lg cursor-pointer hover:shadow-md flex justify-between items-center"
                             @click=${() => this._handleLessonClick(lesson.id)}>
                            <div class="min-w-0 flex-grow mr-6"> 
                                <h3 class="font-semibold text-slate-800 truncate" title="${lesson.title}">${lesson.title}</h3>
                                <p class="text-sm text-slate-500 truncate" title="${lesson.subtitle || ''}">${lesson.subtitle || ' '}</p>
                            </div>
                             <button class="delete-lesson-btn ${btnIconDestructive} flex-shrink-0" data-lesson-id="${lesson.id}"
                                    title="${this.t('common.delete') || 'Smazat'}"
                                    @click=${(e) => this._handleDeleteClick(e, lesson.id)}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2 2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </div>
                `)}
                 ${this.lessonsData.length === 0 ? html`<p class="text-center text-slate-500 p-4">${this.t('library.empty') || 'Zatím žádné lekce.'}</p>`: ''}
            </div>
            <footer class="p-4 border-t border-slate-200 flex-shrink-0 bg-slate-50 sticky bottom-0 z-10">
                <button id="add-new-lesson-btn" class="${btnPrimary}" @click=${this._handleAddNewClick}> 
                    ${this.t('library.add_new') || 'Přidat novou lekci'}
                </button>
            </footer>
        `;
    }
}
customElements.define('lesson-library', LessonLibrary);
