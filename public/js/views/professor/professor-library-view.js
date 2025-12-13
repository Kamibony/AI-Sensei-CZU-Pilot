import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, auth } from '../../firebase-init.js';
import { translationService } from '../../utils/translation-service.js';

export class ProfessorLibraryView extends LitElement {
    static properties = {
        _lessons: { state: true, type: Array },
        _groupedLessons: { state: true, type: Object },
        _isLoading: { state: true, type: Boolean }
    };

    constructor() {
        super();
        this._lessons = [];
        this._groupedLessons = {};
        this._isLoading = true;
        this._unsubscribeLessons = null;
        this._authUnsub = null;
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        // Wait for auth to be ready before fetching
        this._authUnsub = auth.onAuthStateChanged(user => {
            if (user) {
                this._fetchLessons();
            } else {
                this._isLoading = false;
            }
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._unsubscribeLessons) {
            this._unsubscribeLessons();
        }
        if (this._authUnsub) {
            this._authUnsub();
        }
    }

    _fetchLessons() {
        const user = auth.currentUser;
        if (!user) return;

        this._isLoading = true;
        try {
            let q;
            if (user.email === 'profesor@profesor.cz') {
                 q = query(collection(db, 'lessons'), orderBy('updatedAt', 'desc'));
            } else {
                 q = query(collection(db, 'lessons'), where('ownerId', '==', user.uid), orderBy('updatedAt', 'desc'));
            }

            this._unsubscribeLessons = onSnapshot(q, (snapshot) => {
                this._lessons = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                this._groupLessonsBySubject();
                this._isLoading = false;
            }, (error) => {
                console.error("Error fetching lessons:", error);
                this._isLoading = false;
            });

        } catch (error) {
            console.error("Error setting up listener:", error);
            this._isLoading = false;
        }
    }

    _groupLessonsBySubject() {
        const groups = {};
        const otherLabel = translationService.t('common.other') || "Ostatní";

        this._lessons.forEach(lesson => {
            const subject = lesson.subject || otherLabel;
            if (!groups[subject]) {
                groups[subject] = [];
            }
            groups[subject].push(lesson);
        });

        // Sort subjects alphabetically, but keep "Other/Ostatní" at the end if it exists
        const sortedKeys = Object.keys(groups).sort((a, b) => {
             if (a === otherLabel) return 1;
             if (b === otherLabel) return -1;
             return a.localeCompare(b);
        });

        const sortedGroups = {};
        sortedKeys.forEach(key => {
            sortedGroups[key] = groups[key];
        });

        this._groupedLessons = sortedGroups;
    }

    _handleNewLesson() {
        this.dispatchEvent(new CustomEvent('navigate', {
            detail: { view: 'editor' },
            bubbles: true,
            composed: true
        }));
    }

    _handleOpenLesson(lesson) {
        this.dispatchEvent(new CustomEvent('navigate', {
            detail: { view: 'editor', id: lesson.id, ...lesson },
            bubbles: true,
            composed: true
        }));
    }

    _getStatusBadge(status) {
        const statusMap = {
            'draft': { label: translationService.t('status.draft') || 'Koncept', class: 'bg-slate-100 text-slate-600' },
            'published': { label: translationService.t('status.published') || 'Publikováno', class: 'bg-green-100 text-green-700' },
            'archived': { label: translationService.t('status.archived') || 'Archivováno', class: 'bg-orange-100 text-orange-700' }
        };
        // Default to concept if unknown
        const s = statusMap[status] || statusMap['draft'];
        return html`<span class="px-2 py-1 rounded-md text-xs font-bold ${s.class}">${s.label}</span>`;
    }

    render() {
        return html`
            <div class="h-full flex flex-col bg-slate-50/50">
                <!-- Header -->
                <div class="px-8 py-6 flex justify-between items-center border-b border-slate-200 bg-white">
                    <div>
                        <h1 class="text-2xl font-bold text-slate-800">${translationService.t('nav.library') || 'Knihovna lekcí'}</h1>
                        <p class="text-slate-500 text-sm mt-1">${translationService.t('library.subtitle') || 'Spravujte všechny své výukové materiály na jednom místě'}</p>
                    </div>
                    <button @click="${this._handleNewLesson}" class="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 shadow-sm transition-all flex items-center gap-2">
                        <span>✨</span> ${translationService.t('lesson.new') || 'Nová lekce'}
                    </button>
                </div>

                <!-- Content -->
                <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    ${this._isLoading ? html`
                        <div class="flex justify-center items-center h-64">
                            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        </div>
                    ` : Object.keys(this._groupedLessons).length === 0 ? html`
                        <div class="flex flex-col items-center justify-center h-full text-slate-400">
                             <span class="text-4xl mb-4">📂</span>
                             <p>${translationService.t('library.empty') || 'Zatím zde nejsou žádné lekce.'}</p>
                             <button @click="${this._handleNewLesson}" class="mt-4 text-indigo-600 font-semibold hover:underline">${translationService.t('library.create_first') || 'Vytvořit první lekci'}</button>
                        </div>
                    ` : html`
                        <div class="space-y-8">
                            ${Object.entries(this._groupedLessons).map(([subject, lessons]) => html`
                                <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                                    <h2 class="text-xl font-bold text-slate-800 mb-4 px-2 border-l-4 border-indigo-500 pl-3">${subject}</h2>

                                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                        ${lessons.map(lesson => html`
                                            <div class="group relative bg-slate-50 hover:bg-white border border-slate-200 hover:border-indigo-200 rounded-2xl p-5 transition-all hover:shadow-lg flex flex-col h-full">
                                                <div class="flex justify-between items-start mb-3">
                                                     <div class="p-2 bg-white rounded-xl shadow-sm text-xl border border-slate-100">
                                                        ${this._getContentTypeIcon(lesson.contentType)}
                                                     </div>
                                                     ${this._getStatusBadge(lesson.status)}
                                                </div>

                                                <h3 class="font-bold text-slate-800 mb-1 line-clamp-1" title="${lesson.title}">${lesson.title}</h3>
                                                <p class="text-sm text-slate-500 mb-4 line-clamp-2 min-h-[2.5em]">${lesson.topic || (translationService.t('common.no_description') || 'Bez popisu')}</p>

                                                <div class="mt-auto pt-4 border-t border-slate-100 flex justify-between items-center">
                                                    <span class="text-xs text-slate-400 font-medium">
                                                        ${lesson.updatedAt ? new Date(lesson.updatedAt).toLocaleDateString('cs-CZ') : new Date(lesson.createdAt).toLocaleDateString('cs-CZ')}
                                                    </span>
                                                    <button @click="${() => this._handleOpenLesson(lesson)}" class="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg group-hover:bg-indigo-50 group-hover:text-indigo-700 group-hover:border-indigo-200 transition-colors">
                                                        ${translationService.t('common.open') || 'Otevřít'}
                                                    </button>
                                                </div>
                                            </div>
                                        `)}
                                    </div>
                                </div>
                            `)}
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    _getContentTypeIcon(type) {
        const icons = {
            'text': '📝',
            'presentation': '📊',
            'quiz': '❓',
            'test': '📝',
            'post': '📰',
            'video': '🎥',
            'audio': '🎙️',
            'comic': '💬'
        };
        return icons[type] || '📄';
    }
}
customElements.define('professor-library-view', ProfessorLibraryView);
