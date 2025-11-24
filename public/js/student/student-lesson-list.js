// Súbor: public/js/student/student-lesson-list.js
import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, onSnapshot, collection, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../firebase-init.js';

export class StudentLessonList extends LitElement {

    static properties = {
        lessons: { type: Array, state: true },
        isLoading: { type: Boolean, state: true },
        error: { type: String, state: true },
        isNotInAnyGroup: { type: Boolean, state: true },
    };

    constructor() {
        super();
        this.lessons = [];
        this.isLoading = true;
        this.error = null;
        this.isNotInAnyGroup = false;
        this.studentUnsubscribe = null;
        this.lessonsUnsubscribe = null;
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._initReactiveLessons();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.studentUnsubscribe) {
            this.studentUnsubscribe();
        }
        if (this.lessonsUnsubscribe) {
            this.lessonsUnsubscribe();
        }
    }

    _initReactiveLessons() {
        this.isLoading = true;
        this.error = null;
        const currentUser = firebaseInit.auth.currentUser;

        if (!currentUser) {
            this.error = "Pro zobrazení lekcí se musíte přihlásit.";
            this.isLoading = false;
            return;
        }

        const studentDocRef = doc(firebaseInit.db, "students", currentUser.uid);

        this.studentUnsubscribe = onSnapshot(studentDocRef, (studentSnap) => {
            // Unsubscribe from previous lesson listener to prevent leaks
            if (this.lessonsUnsubscribe) {
                this.lessonsUnsubscribe();
            }

            if (!studentSnap.exists() || !studentSnap.data().memberOfGroups || studentSnap.data().memberOfGroups.length === 0) {
                this.isNotInAnyGroup = true;
                this.lessons = [];
                this.isLoading = false;
                return;
            }

            this.isNotInAnyGroup = false;
            let myGroups = studentSnap.data().memberOfGroups;

            // Firestore limits 'array-contains-any' to 30 elements
            if (myGroups.length > 30) {
                myGroups = myGroups.slice(0, 30);
            }

            const lessonsQuery = query(
                collection(firebaseInit.db, "lessons"),
                where("assignedToGroups", "array-contains-any", myGroups),
                orderBy("createdAt", "desc")
            );

            this.lessonsUnsubscribe = onSnapshot(lessonsQuery, (querySnapshot) => {
                this.lessons = querySnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString()
                    };
                });
                this.isLoading = false;
            }, (error) => {
                console.error("Error fetching lessons with onSnapshot:", error);
                this.error = "Nepodařilo se reaktivně načíst lekce.";
                this.isLoading = false;
            });

        }, (error) => {
            console.error("Error fetching student profile:", error);
            this.error = "Nepodařilo se načíst profil studenta.";
            this.isLoading = false;
        });
    }

    _handleLessonClick(lessonId) {
        this.dispatchEvent(new CustomEvent('lesson-selected', { 
            detail: { lessonId: lessonId },
            bubbles: true, 
            composed: true 
        }));
    }

    _renderContent() {
        if (this.isLoading) {
            return html`
                <div class="flex justify-center items-center h-64">
                     <div class="spinner w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>`;
        }

        if (this.error) {
            return html`<div class="bg-red-50 p-4 text-red-700 rounded-2xl flex items-center shadow-sm"><span class="mr-2">⚠️</span> ${this.error}</div>`;
        }

        if (this.isNotInAnyGroup) {
            return html`
                <div class="text-center py-16 bg-white rounded-3xl border border-slate-100 shadow-sm">
                    <div class="text-5xl mb-4">🚪</div>
                    <h3 class="text-xl font-bold text-slate-800">Zatím nejste v žádné třídě</h3>
                    <p class="text-slate-500 mt-2">Připojte se prosím do třídy pomocí kódu od vašeho profesora.</p>
                </div>`;
        }

        if (this.lessons.length === 0) {
            return html`
                <div class="text-center py-16 bg-white rounded-3xl border border-slate-100 shadow-sm">
                    <div class="text-5xl mb-4">📭</div>
                    <h3 class="text-xl font-bold text-slate-800">Žádné lekce</h3>
                    <p class="text-slate-500 mt-2">Zatím vám nebyly přiřazeny žádné lekce.</p>
                </div>`;
        }

        return html`
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                ${this.lessons.map(lesson => html`
                    <div @click=${() => this._handleLessonClick(lesson.id)}
                         class="group bg-white rounded-2xl shadow-sm hover:shadow-xl hover:shadow-indigo-100/50 overflow-hidden cursor-pointer transition-all duration-300 transform hover:-translate-y-1 flex flex-col h-full min-h-[260px] border border-slate-100">
                        
                        <!-- Colorful Gradient Header Strip -->
                        <div class="h-4 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                        
                        <div class="p-6 flex flex-col flex-grow justify-between">
                            <div>
                                <div class="flex items-center justify-between mb-3">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                                        Lekce
                                    </span>
                                    <span class="text-xs text-slate-400">
                                        ${lesson.createdAt ? new Date(lesson.createdAt).toLocaleDateString('cs-CZ') : ''}
                                    </span>
                                </div>

                                <h3 class="text-2xl font-bold text-slate-800 leading-tight group-hover:text-indigo-600 transition-colors line-clamp-2 mb-3">
                                    ${lesson.title}
                                </h3>
                                ${lesson.subtitle ? html`<p class="text-sm text-slate-500 line-clamp-3 leading-relaxed">${lesson.subtitle}</p>` : nothing}
                            </div>
                            
                            <div class="mt-8 pt-4 border-t border-slate-50 flex items-center justify-end">
                                <span class="inline-flex items-center px-6 py-2 rounded-full text-sm font-bold bg-slate-900 text-white shadow-lg group-hover:bg-indigo-600 group-hover:shadow-indigo-200 transition-all duration-300">
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
                <div class="flex items-center justify-between mb-8">
                    <div>
                        <h2 class="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">Knihovna</h2>
                        <p class="text-slate-500 mt-1">Vaše studijní materiály a lekce</p>
                    </div>

                </div>
                ${this._renderContent()}
            </div>
        `;
    }
}
customElements.define('student-lesson-list', StudentLessonList);
