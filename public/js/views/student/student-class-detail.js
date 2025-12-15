import { LitElement, html, nothing } from 'https://cdn.skypack.dev/lit';
import { doc, getDoc, updateDoc, arrayRemove, collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { translationService } from '../../utils/translation-service.js';

export class StudentClassDetail extends LitElement {
    static properties = {
        groupId: { type: String },
        _classData: { type: Object, state: true },
        _lessons: { type: Array, state: true },
        _teacherName: { type: String, state: true },
        _isLoading: { type: Boolean, state: true }
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this._isLoading = true;
        this._classData = null;
        this._lessons = [];
        this._teacherName = '';
    }

    connectedCallback() {
        super.connectedCallback();
        if (this.groupId) {
            this._fetchData();
        }
        this._langUnsubscribe = translationService.subscribe(() => this.requestUpdate());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._lessonsUnsubscribe) this._lessonsUnsubscribe();
        if (this._langUnsubscribe) this._langUnsubscribe();
    }

    async _fetchData() {
        this._isLoading = true;
        try {
            // Fetch Group Details
            const groupRef = doc(firebaseInit.db, "groups", this.groupId);
            const groupSnap = await getDoc(groupRef);

            if (groupSnap.exists()) {
                this._classData = { id: groupSnap.id, ...groupSnap.data() };
                this._teacherName = this._classData.ownerName || 'Učitel';

                // Fetch Lessons
                this._subscribeToLessons();
            } else {
                console.error("Class not found");
                this._goBack();
            }
        } catch (error) {
            console.error("Error loading class detail:", error);
        } finally {
            this._isLoading = false;
        }
    }

    _subscribeToLessons() {
        const q = query(
            collection(firebaseInit.db, "lessons"),
            where("assignedToGroups", "array-contains", this.groupId),
            where("status", "==", "published"),
            orderBy("createdAt", "desc")
        );

        this._lessonsUnsubscribe = onSnapshot(q, (snapshot) => {
            this._lessons = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            this.requestUpdate();
        });
    }

    async _handleLeaveClass() {
        if (!confirm(translationService.t('student_dashboard.leave_class_confirm', 'Opravdu chcete opustit tuto třídu?'))) {
            return;
        }

        const user = firebaseInit.auth.currentUser;
        if (!user) return;

        try {
            const studentRef = doc(firebaseInit.db, "students", user.uid);
            await updateDoc(studentRef, {
                memberOfGroups: arrayRemove(this.groupId)
            });

            // Dispatch event to go back
            this._goBack();
        } catch (error) {
            console.error("Error leaving class:", error);
        }
    }

    _handleLessonClick(lessonId) {
        // Dispatch event to open lesson detail
        const event = new CustomEvent('lesson-selected', {
            detail: { lessonId: lessonId },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    _goBack() {
        const event = new CustomEvent('back-to-classes', { bubbles: true, composed: true });
        this.dispatchEvent(event);
    }

    render() {
        if (this._isLoading) {
             return html`
                <div class="flex justify-center items-center h-full min-h-[50vh]">
                     <div class="spinner w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>`;
        }

        if (!this._classData) return nothing;

        return html`
            <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <!-- Header -->
                <div class="mb-8">
                    <button @click=${this._goBack} class="text-slate-500 hover:text-indigo-600 mb-4 flex items-center gap-2 transition-colors">
                        <span>←</span> Zpět na seznam tříd
                    </button>

                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h2 class="text-3xl font-extrabold text-slate-900 tracking-tight">${this._classData.name}</h2>
                            <p class="text-slate-500 mt-1 flex items-center gap-2">
                                👨‍🏫 ${this._teacherName}
                            </p>
                        </div>
                        <button @click=${this._handleLeaveClass}
                            class="text-red-500 hover:text-red-700 font-medium px-4 py-2 rounded-lg hover:bg-red-50 transition-colors border border-transparent hover:border-red-100">
                            Opustit třídu
                        </button>
                    </div>
                </div>

                <!-- Lessons List -->
                <div class="space-y-4">
                    <h3 class="text-xl font-bold text-slate-800 mb-4">Lekce v této třídě</h3>

                    ${this._lessons.length > 0 ? html`
                        <div class="grid gap-4">
                            ${this._lessons.map(lesson => html`
                                <div @click=${() => this._handleLessonClick(lesson.id)}
                                    class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer group">
                                    <div class="flex justify-between items-start">
                                        <div>
                                            <h4 class="font-bold text-slate-800 text-lg group-hover:text-indigo-600 transition-colors">${lesson.title}</h4>
                                            <p class="text-slate-500 text-sm mt-1 line-clamp-2">${lesson.description || 'Bez popisu'}</p>
                                        </div>
                                        <div class="text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-1">
                                            →
                                        </div>
                                    </div>
                                    <div class="mt-4 flex items-center gap-3 text-xs text-slate-400">
                                        <span>📅 ${lesson.createdAt?.seconds ? new Date(lesson.createdAt.seconds * 1000).toLocaleDateString() : ''}</span>
                                        ${lesson.topic ? html`<span class="bg-slate-100 px-2 py-1 rounded text-slate-500">${lesson.topic}</span>` : nothing}
                                    </div>
                                </div>
                            `)}
                        </div>
                    ` : html`
                        <div class="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
                            <p class="text-slate-400">V této třídě zatím nejsou žádné lekce.</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    }
}
customElements.define('student-class-detail', StudentClassDetail);
