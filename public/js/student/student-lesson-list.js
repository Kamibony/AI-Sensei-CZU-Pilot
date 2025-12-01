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
        if (this.studentUnsubscribe) this.studentUnsubscribe();
        if (this.lessonsUnsubscribe) this.lessonsUnsubscribe();
    }

    _initReactiveLessons() {
        this.isLoading = true;
        this.error = null;
        const currentUser = firebaseInit.auth.currentUser;

        if (!currentUser) {
            this.isLoading = false;
            return;
        }

        const studentDocRef = doc(firebaseInit.db, "students", currentUser.uid);

        this.studentUnsubscribe = onSnapshot(studentDocRef, (studentSnap) => {
            if (this.lessonsUnsubscribe) this.lessonsUnsubscribe();

            if (!studentSnap.exists() || !studentSnap.data().memberOfGroups || studentSnap.data().memberOfGroups.length === 0) {
                this.isNotInAnyGroup = true;
                this.lessons = [];
                this.isLoading = false;
                return;
            }

            this.isNotInAnyGroup = false;
            let myGroups = studentSnap.data().memberOfGroups;
            if (myGroups.length > 30) myGroups = myGroups.slice(0, 30);

            // FIX: Removed 'published' filter so drafts are visible (per user request)
            try {
                const lessonsQuery = query(
                    collection(firebaseInit.db, "lessons"),
                    where("assignedToGroups", "array-contains-any", myGroups),
                    orderBy("createdAt", "desc")
                );

                this.lessonsUnsubscribe = onSnapshot(lessonsQuery, (querySnapshot) => {
                    this.lessons = querySnapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data(),
                        createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate().toISOString() : new Date().toISOString()
                    }));
                    this.isLoading = false;
                }, (error) => {
                    console.error("Error fetching lessons:", error);
                    // Improved error handling for missing index
                    if (error.code === 'failed-precondition' || error.message.includes('index')) {
                        console.error("🔥 MISSING INDEX ERROR: The query requires an index. Please create it in the Firebase Console.", error);
                        // Using a user-friendly message inline instead of toast
                        this.error = "Systémová chyba: Chybí databázový index. Kontaktujte prosím podporu.";
                    } else {
                        this.error = "Nepodařilo se načíst lekce.";
                    }
                    this.isLoading = false;
                });
            } catch (e) {
                console.error("Query setup error:", e);
                this.error = "Chyba dotazu.";
                this.isLoading = false;
            }

        }, (error) => {
            console.error("Error fetching student profile:", error);
            this.error = "Chyba profilu.";
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

    render() {
        if (this.isLoading) {
            return html`<div class="flex justify-center p-20"><div class="spinner w-10 h-10 border-4 border-indigo-600 rounded-full animate-spin border-t-transparent"></div></div>`;
        }

        return html`
            <div class="max-w-7xl mx-auto px-6 py-8">
                <div class="mb-8 flex items-center justify-between">
                    <div>
                        <h2 class="text-3xl font-extrabold text-slate-900 tracking-tight">Knihovna lekcí</h2>
                        <p class="text-slate-500 mt-1">Vaše studijní materiály</p>
                    </div>
                </div>

                ${this.error ? html`<div class="bg-red-50 p-4 text-red-700 rounded-xl border border-red-100 mb-6 flex items-center gap-3"><span class="text-2xl">⚠️</span>${this.error}</div>` : nothing}

                ${this.isNotInAnyGroup ? html`
                    <div class="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                        <div class="text-5xl mb-4">🏫</div>
                        <h3 class="text-xl font-bold text-slate-800">Žádné třídy</h3>
                        <p class="text-slate-500 mt-2 mb-6">Nejste členem žádné třídy.</p>
                        <button @click=${() => document.dispatchEvent(new CustomEvent('open-join-modal'))} class="text-indigo-600 font-bold hover:underline">Připojit se k třídě</button>
                    </div>
                ` : nothing}

                ${!this.isLoading && !this.error && !this.isNotInAnyGroup && this.lessons.length === 0 ? html`
                    <div class="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                        <div class="text-5xl mb-4">📭</div>
                        <h3 class="text-xl font-bold text-slate-800">Žádné lekce</h3>
                        <p class="text-slate-500 mt-2">V této třídě zatím nejsou žádné lekce.</p>
                    </div>
                ` : nothing}

                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    ${this.lessons.map(lesson => html`
                        <div @click=${() => this._handleLessonClick(lesson.id)}
                             class="group bg-white rounded-2xl shadow-sm hover:shadow-xl hover:shadow-indigo-100/50 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 flex flex-col h-full border border-slate-100 relative overflow-hidden">
                            
                            <div class="h-3 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                            
                            <div class="p-6 flex flex-col flex-grow">
                                <div class="flex justify-between items-start mb-3">
                                    <span class="px-2 py-1 bg-slate-100 text-slate-500 text-xs font-bold rounded uppercase tracking-wider">
                                        Lekce
                                    </span>
                                    ${lesson.status !== 'published' ? html`<span class="text-xs text-amber-500 font-bold bg-amber-50 px-2 py-1 rounded">⚠️ Draft</span>` : ''}
                                </div>

                                <h3 class="text-xl font-bold text-slate-900 mb-2 line-clamp-2 group-hover:text-indigo-600 transition-colors">
                                    ${lesson.title}
                                </h3>
                                ${lesson.subtitle ? html`<p class="text-sm text-slate-500 line-clamp-2 mb-4">${lesson.subtitle}</p>` : ''}
                                
                                <div class="mt-auto pt-4 flex items-center justify-between text-sm text-slate-400 border-t border-slate-50">
                                    <span>${new Date(lesson.createdAt).toLocaleDateString('cs-CZ')}</span>
                                    <span class="group-hover:translate-x-1 transition-transform text-indigo-500 font-bold">Otevřít →</span>
                                </div>
                            </div>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }
}
customElements.define('student-lesson-list', StudentLessonList);
