import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, onSnapshot, collection, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { translationService } from '../../utils/translation-service.js';
import { getCollectionPath } from '../../utils/utils.js';

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
        this._langUnsubscribe = null;
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._langUnsubscribe = translationService.subscribe(() => this.requestUpdate());
        this._initReactiveLessons();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.studentUnsubscribe) this.studentUnsubscribe();
        if (this.lessonsUnsubscribe) this.lessonsUnsubscribe();
        if (this._langUnsubscribe) this._langUnsubscribe();
    }

    _initReactiveLessons() {
        this.isLoading = true;
        this.error = null;
        const currentUser = firebaseInit.auth.currentUser;

        if (!currentUser) {
            this.isLoading = false;
            return;
        }

        if (currentUser.isAnonymous) {
            // Demo Mode Logic
            const groupsPath = getCollectionPath('groups');
            const q = query(
                collection(firebaseInit.db, groupsPath),
                where('ownerId', '==', currentUser.uid)
            );

            this.studentUnsubscribe = onSnapshot(q, (snapshot) => {
                if (this.lessonsUnsubscribe) this.lessonsUnsubscribe();

                if (snapshot.empty) {
                    this.isNotInAnyGroup = true;
                    this.lessons = [];
                    this.isLoading = false;
                    return;
                }

                const groupDoc = snapshot.docs[0];
                this._setupLessonsListener([groupDoc.id]);
            }, (error) => {
                console.error("Error fetching demo group:", error);
                this.error = "Chyba načítání demo třídy.";
                this.isLoading = false;
            });

        } else {
            // Standard Mode
            const studentsPath = getCollectionPath("students");
            const studentDocRef = doc(firebaseInit.db, studentsPath, currentUser.uid);

            this.studentUnsubscribe = onSnapshot(studentDocRef, (studentSnap) => {
                if (this.lessonsUnsubscribe) this.lessonsUnsubscribe();

                if (!studentSnap.exists() || !studentSnap.data().memberOfGroups || studentSnap.data().memberOfGroups.length === 0) {
                    this.isNotInAnyGroup = true;
                    this.lessons = [];
                    this.isLoading = false;
                    return;
                }

                this._setupLessonsListener(studentSnap.data().memberOfGroups);

            }, (error) => {
                console.error("Error fetching student profile:", error);
                this.error = "Chyba profilu.";
                this.isLoading = false;
            });
        }
    }

    _setupLessonsListener(myGroups) {
        this.isNotInAnyGroup = false;
        if (myGroups.length > 10) myGroups = myGroups.slice(0, 10);

        try {
            const lessonsPath = getCollectionPath("lessons");
            const lessonsQuery = query(
                collection(firebaseInit.db, lessonsPath),
                where("assignedToGroups", "array-contains-any", myGroups),
                where("status", "==", "published"), // Students must NOT see drafts
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
                if (error.code === 'failed-precondition' || error.message.includes('index')) {
                    console.error("🔥 MISSING INDEX ERROR: The query requires an index. Please create it in the Firebase Console.", error);
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
    }

    _handleLessonClick(lessonId) {
        this.dispatchEvent(new CustomEvent('lesson-selected', {
            detail: { lessonId: lessonId },
            bubbles: true,
            composed: true
        }));
    }

    _groupLessonsBySubject() {
        const grouped = {};
        this.lessons.forEach(lesson => {
            const subject = lesson.subject || translationService.t('common.other') || 'Ostatní';
            if (!grouped[subject]) {
                grouped[subject] = [];
            }
            grouped[subject].push(lesson);
        });
        return grouped;
    }

    _isNew(createdAt) {
        if (!createdAt) return false;
        const createdDate = new Date(createdAt);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return createdDate > sevenDaysAgo;
    }

    render() {
        const t = (key) => translationService.t(key);

        if (this.isLoading) {
            return html`<div class="flex justify-center p-20"><div class="spinner w-10 h-10 border-4 border-indigo-600 rounded-full animate-spin border-t-transparent"></div></div>`;
        }

        const groupedLessons = this._groupLessonsBySubject();
        const subjects = Object.keys(groupedLessons).sort();

        return html`
            <div class="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-8 md:space-y-12">

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

                ${subjects.map(subject => html`
                    <div class="animate-fade-in-up">
                        <div class="flex items-center gap-3 mb-4 md:mb-6">
                            <div class="h-6 md:h-8 w-1 md:w-1.5 bg-indigo-500 rounded-full"></div>
                            <h2 class="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">${subject}</h2>
                            <span class="px-2 md:px-2.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] md:text-xs font-bold rounded-full">
                                ${groupedLessons[subject].length}
                            </span>
                        </div>

                        <!-- Adaptive Grid: Columns on Desktop, Stack on Mobile (handled by card flex-row) -->
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                            ${groupedLessons[subject].map(lesson => html`
                                <div @click=${() => this._handleLessonClick(lesson.id)}
                                     class="group bg-white rounded-2xl md:rounded-3xl shadow-sm hover:shadow-xl hover:shadow-indigo-100/50 cursor-pointer transition-all duration-200 transform active:scale-95 flex flex-row md:flex-col h-auto md:h-full border border-slate-100 relative overflow-hidden">

                                    ${this._isNew(lesson.createdAt) ? html`
                                        <div class="absolute top-2 right-2 md:top-4 md:right-4 z-10">
                                            <span class="px-1.5 py-0.5 md:px-2 md:py-1 bg-gradient-to-r from-pink-500 to-rose-500 text-white text-[9px] md:text-[10px] font-bold uppercase tracking-wider rounded-md md:rounded-lg shadow-sm">
                                                Novinka
                                            </span>
                                        </div>
                                    ` : ''}

                                    <!-- Thumbnail: Fixed Width on Mobile (Left), Full Width on Desktop (Top) -->
                                    <div class="w-24 sm:w-32 md:w-full h-auto min-h-[6rem] md:h-40 bg-slate-50 relative flex-shrink-0 flex items-center justify-center border-r md:border-r-0 md:border-b border-slate-100">
                                        <!-- Placeholder Pattern -->
                                        <div class="absolute inset-0 opacity-10 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px]"></div>

                                        <div class="text-4xl md:text-6xl transform group-hover:scale-110 transition-transform duration-300">
                                            ${this._getIconForTopic(lesson.topic)}
                                        </div>

                                        <!-- Gradient overlay only on Desktop -->
                                        <div class="hidden md:block absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-white to-transparent"></div>
                                    </div>

                                    <!-- Content -->
                                    <div class="p-3 md:p-6 flex flex-col flex-grow justify-between min-w-0">

                                        <div>
                                            <div class="flex justify-between items-start mb-1 md:mb-2">
                                                <span class="text-xs md:text-xs font-bold text-indigo-600 uppercase tracking-wider truncate pr-2">
                                                    ${lesson.topic || 'Obecné'}
                                                </span>
                                                ${lesson.status !== 'published' ? html`<span class="flex-shrink-0 text-[9px] md:text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">Draft</span>` : ''}
                                            </div>

                                            <h3 class="text-sm md:text-lg font-bold text-slate-900 mb-1 md:mb-2 line-clamp-2 group-hover:text-indigo-600 transition-colors leading-tight">
                                                ${lesson.title}
                                            </h3>

                                            ${lesson.subtitle ? html`
                                                <p class="text-xs md:text-sm text-slate-500 line-clamp-1 md:line-clamp-2 mb-2 md:mb-4 leading-relaxed hidden sm:block">${lesson.subtitle}</p>
                                            ` : ''}
                                        </div>

                                        <div class="mt-auto pt-2 md:pt-4 flex items-center justify-between text-[10px] md:text-xs font-medium text-slate-400 border-t border-slate-50 md:border-slate-50">
                                            <div class="flex items-center gap-1">
                                                <svg class="w-3 h-3 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                                <span>${new Date(lesson.createdAt).toLocaleDateString('cs-CZ')}</span>
                                            </div>
                                            <span class="group-hover:translate-x-1 transition-transform text-indigo-600 flex items-center gap-1">
                                                <span class="hidden md:inline">Otevřít</span>
                                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            `)}
                        </div>
                    </div>
                `)}
            </div>
        `;
    }

    _getIconForTopic(topic) {
        if (!topic) return '📚';
        const t = topic.toLowerCase();
        if (t.includes('mat')) return '📐';
        if (t.includes('fyz')) return '⚡';
        if (t.includes('chem')) return '🧪';
        if (t.includes('biol')) return '🧬';
        if (t.includes('děj') || t.includes('hist')) return '🏛️';
        if (t.includes('zem') || t.includes('geo')) return '🌍';
        if (t.includes('jazyk') || t.includes('lit')) return '📖';
        if (t.includes('it') || t.includes('inf')) return '💻';
        return '📚';
    }
}
customElements.define('student-lesson-list', StudentLessonList);
