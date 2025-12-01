import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, onSnapshot, collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { translationService } from '../../utils/translation-service.js';
import { showToast } from '../../utils.js'; // Pridaný import pre showToast

export class StudentDashboardView extends LitElement {
    static properties = {
        _studentName: { type: String, state: true },
        _studentStreak: { type: Number, state: true },
        _recentLesson: { type: Object, state: true }, // Len jedna najnovšia pre Hero sekciu
        _stats: { type: Object, state: true }, // Počty pre karty
        _isLoading: { type: Boolean, state: true }
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this._studentName = '';
        this._studentStreak = 0;
        this._recentLesson = null;
        this._stats = { classes: 0, lessons: 0 };
        this._isLoading = true;
        this._studentUnsubscribe = null;
    }

    connectedCallback() {
        super.connectedCallback();
        this._fetchData();
        this._langUnsubscribe = translationService.subscribe(() => this.requestUpdate());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._studentUnsubscribe) this._studentUnsubscribe();
        if (this._langUnsubscribe) this._langUnsubscribe();
    }

    async _fetchData() {
        const user = firebaseInit.auth.currentUser;
        if (!user) return;

        const userDocRef = doc(firebaseInit.db, "students", user.uid);
        this._studentUnsubscribe = onSnapshot(userDocRef, async (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                this._studentName = data.name || 'Studente';
                this._studentStreak = data.streak || 0;
                
                const groupIds = data.memberOfGroups || [];
                this._stats = { ...this._stats, classes: groupIds.length };

                if (groupIds.length > 0) {
                    await this._fetchDashboardData(groupIds);
                } else {
                    this._isLoading = false;
                }
            }
        });
    }

    async _fetchDashboardData(groupIds) {
        try {
            // Firestore limit pre 'in'/'array-contains-any' je 30
            const safeGroups = groupIds.slice(0, 30);

            // 1. Získať najnovšiu lekciu pre Hero sekciu
            // POZOR: Toto vyžaduje index (assignedToGroups + createdAt). Ak chýba, chytíme chybu.
            const qLesson = query(
                collection(firebaseInit.db, "lessons"),
                where("assignedToGroups", "array-contains-any", safeGroups),
                orderBy("createdAt", "desc"),
                limit(1)
            );

            const lessonSnap = await getDocs(qLesson);
            if (!lessonSnap.empty) {
                const doc = lessonSnap.docs[0];
                this._recentLesson = { id: doc.id, ...doc.data() };
            }

            // 2. Získať počet lekcií (orientačne) - pre odznak na karte
            // Robíme to isté query ale bez limitu (alebo limit 50 pre performance) len na zistenie počtu
            const qCount = query(
                collection(firebaseInit.db, "lessons"),
                where("assignedToGroups", "array-contains-any", safeGroups),
                limit(50) 
            );
            const countSnap = await getDocs(qCount);
            this._stats = { ...this._stats, lessons: countSnap.size };

        } catch (error) {
            console.warn("Dashboard data fetch error (Index chýba?):", error);
        } finally {
            this._isLoading = false;
        }
    }

    _navigateTo(view, detail = {}) {
        this.dispatchEvent(new CustomEvent('navigate', { 
            detail: { view, ...detail },
            bubbles: true, 
            composed: true 
        }));

        // Fallback pre router (student.js), ktorý počúva na konkrétne eventy
        if (view === 'lessons') document.dispatchEvent(new CustomEvent('back-to-list'));
        if (view === 'classes') document.dispatchEvent(new CustomEvent('back-to-classes'));
        if (view === 'lesson-detail') {
            this.dispatchEvent(new CustomEvent('lesson-selected', { 
                detail: { lessonId: detail.lessonId }, 
                bubbles: true, 
                composed: true 
            }));
        }
    }

    render() {
        const t = (key) => translationService.t(key);
        
        if (this._isLoading) {
             return html`<div class="flex justify-center items-center h-full min-h-[50vh]"><div class="spinner w-12 h-12 border-4 border-indigo-600 rounded-full animate-spin border-t-transparent"></div></div>`;
        }

        const firstName = this._studentName.split(' ')[0];

        return html`
            <div class="w-full p-6 md:p-8 space-y-8 max-w-5xl mx-auto">

                <header class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 class="text-3xl font-extrabold text-slate-900 tracking-tight">Můj přehled</h1>
                        <p class="text-slate-500 mt-1">Vítej zpět, ${firstName}! 👋</p>
                    </div>
                    
                    ${this._studentStreak > 0 ? html`
                        <div class="inline-flex items-center gap-2 bg-orange-50 text-orange-600 px-4 py-2 rounded-full font-bold shadow-sm border border-orange-100">
                            <span>🔥</span> ${this._studentStreak} Dní v řadě
                        </div>
                    ` : nothing}
                </header>

                ${this._recentLesson ? html`
                    <section @click=${() => this._navigateTo('lesson-detail', { lessonId: this._recentLesson.id })}
                             class="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-200 transition-all hover:shadow-2xl hover:-translate-y-1 cursor-pointer group">
                        
                        <div class="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl -mr-16 -mt-16"></div>
                        
                        <div class="relative p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                            <div class="space-y-3">
                                <div class="inline-flex items-center space-x-2 bg-white/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-white/10 backdrop-blur-sm">
                                    <span>▶️ ${t('student_dashboard.jump_back')}</span>
                                </div>
                                <h2 class="text-2xl md:text-4xl font-bold leading-tight group-hover:text-indigo-100 transition-colors">
                                    ${this._recentLesson.title}
                                </h2>
                                <p class="text-indigo-100 opacity-90 max-w-xl text-sm md:text-base line-clamp-2">
                                    ${this._recentLesson.subtitle || 'Vraťte se k učení tam, kde jste přestali.'}
                                </p>
                            </div>
                            
                            <div class="flex-shrink-0 bg-white text-indigo-600 rounded-full w-16 h-16 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                <svg class="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            </div>
                        </div>
                    </section>
                ` : html`
                    <div class="bg-slate-100 rounded-3xl p-8 text-center border-2 border-dashed border-slate-200">
                        <p class="text-slate-500 font-medium">Zatím nemáte žádné aktivní lekce.</p>
                        <button @click=${() => this._navigateTo('classes')} class="text-indigo-600 font-bold hover:underline mt-2">Zkontrolovat třídy</button>
                    </div>
                `}

                <section class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    <div @click=${() => this._navigateTo('lessons')}
                         class="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all cursor-pointer group flex flex-col min-h-[220px]">
                        <div class="flex justify-between items-start mb-4">
                            <div class="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
                                📖
                            </div>
                            ${this._stats.lessons > 0 ? html`<span class="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold">${this._stats.lessons}</span>` : ''}
                        </div>
                        <h3 class="text-xl font-bold text-slate-800 mb-2">Moje lekce</h3>
                        <p class="text-sm text-slate-500 mb-4 flex-grow">Kompletní knihovna vašich studijních materiálů a úkolů.</p>
                        <div class="pt-4 border-t border-slate-50 flex items-center text-sm font-bold text-indigo-600 group-hover:translate-x-2 transition-transform">
                            Otevřít knihovnu →
                        </div>
                    </div>

                    <div @click=${() => this._navigateTo('classes')}
                         class="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:border-blue-200 transition-all cursor-pointer group flex flex-col min-h-[220px]">
                        <div class="flex justify-between items-start mb-4">
                            <div class="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
                                🏫
                            </div>
                            ${this._stats.classes > 0 ? html`<span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">${this._stats.classes}</span>` : ''}
                        </div>
                        <h3 class="text-xl font-bold text-slate-800 mb-2">Moje třídy</h3>
                        <p class="text-sm text-slate-500 mb-4 flex-grow">Přehled kurzů, učitelů a možnost připojit se k nové třídě.</p>
                        <div class="pt-4 border-t border-slate-50 flex items-center text-sm font-bold text-blue-600 group-hover:translate-x-2 transition-transform">
                            Spravovat třídy →
                        </div>
                    </div>

                    <div @click=${() => showToast("Agenda se připravuje 📅")}
                         class="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:border-amber-200 transition-all cursor-pointer group flex flex-col min-h-[220px]">
                        <div class="flex justify-between items-start mb-4">
                            <div class="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
                                📅
                            </div>
                        </div>
                        <h3 class="text-xl font-bold text-slate-800 mb-2">Agenda</h3>
                        <p class="text-sm text-slate-500 mb-4 flex-grow">Váš rozvrh, termíny úkolů a důležité události.</p>
                        <div class="pt-4 border-t border-slate-50 flex items-center text-sm font-bold text-amber-600 group-hover:translate-x-2 transition-transform">
                            Zobrazit plán →
                        </div>
                    </div>

                </section>
            </div>
        `;
    }
}
customElements.define('student-dashboard-view', StudentDashboardView);
