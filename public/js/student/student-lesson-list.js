// Súbor: public/js/student/student-lesson-list.js

import { LitElement, html } from 'https://cdn.skypack.dev/lit';
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../firebase-init.js';

export class StudentLessonList extends LitElement {

    static get properties() {
        return {
            lessons: { type: Array, state: true },
            isLoading: { type: Boolean, state: true },
            error: { type: String, state: true },
        };
    }

    constructor() {
        super();
        this.lessons = [];
        this.isLoading = true;
        this.error = null;
    }

    // Vypnutie Shadow DOM pre Tailwind
    createRenderRoot() {
        return this;
    }

    // Komponent sa pripojil, ideme načítať dáta
    connectedCallback() {
        super.connectedCallback();
        this._fetchLessons();
    }

    async _fetchLessons() {
        this.isLoading = true;
        this.error = null;
        try {
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
                this.error = "Chyba databáze: Chybí potřebný index. Prosím, zkontrolujte konzoli (F12) pro více detailů.";
                console.warn("POŽADOVANÁ AKCE: Pro opravu této chyby je nutné vytvořit kompozitní index ve Firestore.");
            } else {
                this.error = `Nepodařilo se načíst lekce: ${error.message}`;
            }
        } finally {
            this.isLoading = false;
        }
    }

    _handleLessonClick(lessonId) {
        // Vytvoríme vlastnú udalosť, ktorú "vypálime" rodičovi (student.js)
        const event = new CustomEvent('lesson-selected', { 
            detail: { lessonId: lessonId },
            bubbles: true, // Umožní udalosti "prebublať" hore
            composed: true 
        });
        this.dispatchEvent(event);
    }

    render() {
        return html`
            <h2 class="text-2xl font-bold mb-6 text-slate-800">Moje lekce</h2>
            
            ${this.isLoading ? html`
                <div class="text-center text-slate-500">Načítání lekcí...</div>
            ` : ''}

            ${this.error ? html`
                <div class="text-red-500 p-4 bg-red-50 rounded-lg">${this.error}</div>
            ` : ''}

            <div id="lessons-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                ${!this.isLoading && this.lessons.length === 0 && !this.error ? html`
                    <p class="text-slate-500">Zatím vám nebyly přiřazeny žádné lekce.</p>
                ` : ''}

                ${this.lessons.map(lesson => html`
                    <div @click=${() => this._handleLessonClick(lesson.id)}
                         class="bg-white p-6 rounded-2xl shadow-lg cursor-pointer hover:shadow-xl hover:ring-2 hover:ring-green-600 transition-all flex flex-col justify-between">
                        <div>
                            <h3 class="text-xl font-bold text-slate-800 mb-2">${lesson.title}</h3>
                            <p class="text-sm text-slate-500 mb-4">
                                Vytvořeno: ${lesson.createdAt ? new Date(lesson.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}
                            </p>
                        </div>
                        <span class="font-semibold text-green-700 self-end mt-4">Otvoriť lekciu &rarr;</span>
                    </div>
                `)}
            </div>
        `;
    }
}

customElements.define('student-lesson-list', StudentLessonList);
