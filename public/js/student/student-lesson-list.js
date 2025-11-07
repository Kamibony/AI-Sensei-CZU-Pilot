// Súbor: public/js/student/student-lesson-list.js
import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../firebase-init.js';

export class StudentLessonList extends LitElement {

    static properties = {
        lessons: { type: Array, state: true },
        isLoading: { type: Boolean, state: true },
        error: { type: String, state: true },
    };

    constructor() {
        super();
        this.lessons = [];
        this.isLoading = true;
        this.error = null;
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._fetchLessons();
    }

    async _fetchLessons() {
        this.isLoading = true;
        this.error = null;
        try {
            // Skúsime načítať lekcie zoradené podľa času
            const q = query(
                collection(firebaseInit.db, "lessons"),
                where("isScheduled", "==", true),
                orderBy("createdAt", "desc")
            );
            const querySnapshot = await getDocs(q);
            this.lessons = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching lessons:", error);
            // Fallback ak chýba index: načítame bez zoradenia a zoradíme v pamäti
            if (error.code === 'failed-precondition') {
                 try {
                    const qFallback = query(collection(firebaseInit.db, "lessons"), where("isScheduled", "==", true));
                    const snap = await getDocs(qFallback);
                    this.lessons = snap.docs.map(d => ({id: d.id, ...d.data()}));
                    this.lessons.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                 } catch (e) { this.error = "Nepodařilo se načíst lekce."; }
            } else {
                this.error = "Nepodařilo se načíst lekce.";
            }
        } finally {
            this.isLoading = false;
        }
    }

    _handleLessonClick(lessonId) {
        this.dispatchEvent(new CustomEvent('lesson-selected', { 
            detail: { lessonId: lessonId },
            bubbles: true, 
            composed: true 
        }));
    }

    // Pomocná metóda pre renderovanie obsahu, aby sme predišli chybám v syntaxi
    _renderContent() {
        if (this.isLoading) {
            return html`
                <div class="flex justify-center items-center h-64">
                     <div class="spinner w-12 h-12 border-4 border-slate-200 border-t-green-600 rounded-full animate-spin"></div>
                </div>`;
        }

        if (this.error) {
            return html`<div class="bg-red-50 p-4 text-red-700 rounded-lg flex items-center"><span class="mr-2">⚠️</span> ${this.error}</div>`;
        }

        if (this.lessons.length === 0) {
            return html`
                <div class="text-center py-16 bg-white rounded-3xl border border-slate-100 shadow-sm">
                    <div class="text-5xl mb-4">📭</div>
                    <h3 class="text-lg font-medium text-slate-900">Žádné lekce</h3>
                    <p class="text-slate-500 mt-2">Zatím vám nebyly přiřazeny žádné lekce.</p>
                </div>`;
        }

        return html`
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                ${this.lessons.map(lesson => html`
                    <div @click=${() => this._handleLessonClick(lesson.id)}
                         class="group bg-white rounded-2xl shadow-sm hover:shadow-xl border border-slate-200 overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 flex flex-col h-full min-h-[220px]">
                        
                        <div class="h-3 bg-gradient-to-r from-green-500 to-emerald-600"></div>
                        
                        <div class="p-6 flex flex-col flex-grow justify-between">
                            <div>
                                <h3 class="text-xl font-bold text-slate-800 leading-tight group-hover:text-green-700 transition-colors line-clamp-2 mb-3">
                                    ${lesson.title}
                                </h3>
                                ${lesson.subtitle ? html`<p class="text-sm text-slate-600 line-clamp-3">${lesson.subtitle}</p>` : nothing}
                            </div>
                            
                            <div class="flex items-center justify-between mt-6 pt-4 border-t border-slate-50">
                                <span class="text-xs text-slate-400">
                                    ${lesson.createdAt ? new Date(lesson.createdAt.seconds * 1000).toLocaleDateString('cs-CZ') : ''}
                                </span>
                                <span class="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-green-50 text-green-700 group-hover:bg-green-600 group-hover:text-white transition-colors">
                                    Otevřít
                                </span>
                            </div>
                        </div>
                    </div>
                `)}
            </div>
        `;
    }

    render() {
        return html`
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <h2 class="text-3xl font-extrabold mb-8 text-slate-800 tracking-tight">Moje dostupné lekce</h2>
                ${this._renderContent()}
            </div>
        `;
    }
}
customElements.define('student-lesson-list', StudentLessonList);
