// Súbor: public/js/student/student-lesson-list.js

import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
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
            // Poznámka: 'isScheduled' == true filtruje len naplánované lekcie.
            // Uistite sa, že vaše lekcie majú toto pole nastavené na true, inak sa nezobrazia.
            const q = query(
                collection(firebaseInit.db, "lessons"), 
                where("isScheduled", "==", true), 
                orderBy("createdAt", "desc")
            );
            
            const querySnapshot = await getDocs(q);
            this.lessons = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching lessons:", error);
            if (error.code === 'failed-precondition') {
                this.error = "Chyba databáze: Chybí potřebný index.";
                console.warn("Pro opravu chyby vytvořte index ve Firebase Console podle odkazu v chybové hlášce prohlížeče.");
            } else {
                this.error = `Nepodařilo se načíst lekce: ${error.message}`;
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

    render() {
        return html`
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <h2 class="text-3xl font-extrabold mb-8 text-slate-800 tracking-tight">Moje dostupné lekce</h2>
                
                ${this.isLoading ? html`
                    <div class="flex justify-center items-center h-64">
                         <div class="spinner w-12 h-12 border-4 border-slate-200 border-t-green-600 rounded-full animate-spin"></div>
                    </div>
                ` : ''}

                ${this.error ? html`
                    <div class="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
                        <div class="flex">
                            <div class="flex-shrink-0">⚠️</div>
                            <div class="ml-3">
                                <p class="text-sm text-red-700">${this.error}</p>
                            </div>
                        </div>
                    </div>
                ` : ''}

                ${!this.isLoading && !this.error ? html`
                    ${this.lessons.length === 0 ? html`
                        <div class="text-center py-16 bg-white rounded-3xl shadow-sm border border-slate-100">
                            <svg class="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                            <h3 class="mt-2 text-sm font-medium text-slate-900">Žádné lekce</h3>
                            <p class="mt-1 text-sm text-slate-500">Zatím vám nebyly přiřazeny žádné lekce.</p>
                        </div>
                    ` : html`
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            ${this.lessons.map(lesson => html`
                                <div @click=${() => this._handleLessonClick(lesson.id)}
                                     class="group bg-white rounded-2xl shadow-sm hover:shadow-xl border border-slate-200 overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 flex flex-col h-full min-h-[200px]">
                                    
                                    <div class="h-2 bg-gradient-to-r from-green-500 to-emerald-600"></div>
                                    
                                    <div class="p-6 flex flex-col flex-grow justify-between">
                                        <div>
                                            <div class="flex justify-between items-start mb-4">
                                                <h3 class="text-xl font-bold text-slate-800 leading-tight group-hover:text-green-700 transition-colors line-clamp-2">
                                                    ${lesson.title}
                                                </h3>
                                            </div>
                                            
                                            ${lesson.subtitle ? html`
                                                <p class="text-sm text-slate-600 mb-4 line-clamp-3">${lesson.subtitle}</p>
                                            ` : ''}
                                        </div>
                                        
                                        <div class="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                                            <span class="text-xs text-slate-400 flex items-center">
                                                <svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                                ${lesson.createdAt ? new Date(lesson.createdAt.seconds * 1000).toLocaleDateString('cs-CZ') : ''}
                                            </span>
                                            
                                            <span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-50 text-green-700 group-hover:bg-green-600 group-hover:text-white transition-colors duration-300">
                                                Otevřít
                                                <svg class="ml-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            `)}
                        </div>
                    `}
                `}
            </div>
        `;
    }
}

customElements.define('student-lesson-list', StudentLessonList);
