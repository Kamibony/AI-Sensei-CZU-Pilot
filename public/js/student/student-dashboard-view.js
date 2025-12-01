import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, onSnapshot, query, collection, where, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../firebase-init.js';

export class StudentDashboardView extends LitElement {
    static properties = {
        user: { type: Object },
        recentLesson: { type: Object, state: true },
        activeClassesCount: { type: Number, state: true },
        streak: { type: Number, state: true },
        isLoading: { type: Boolean, state: true },
        greeting: { type: String, state: true }
    };

    constructor() {
        super();
        this.user = null;
        this.recentLesson = null;
        this.activeClassesCount = 0;
        this.streak = 0;
        this.isLoading = true;
        this.greeting = '';
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._setGreeting();
        this._fetchDashboardData();
    }

    _setGreeting() {
        const hour = new Date().getHours();
        if (hour < 12) this.greeting = 'Dobré ráno';
        else if (hour < 18) this.greeting = 'Dobrý den';
        else this.greeting = 'Dobrý večer';
    }

    _fetchDashboardData() {
        if (!this.user) return;

        // 1. Fetch Student Profile for Groups & Streak
        const studentRef = doc(firebaseInit.db, "students", this.user.uid);
        onSnapshot(studentRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                const groups = data.memberOfGroups || [];
                this.activeClassesCount = groups.length;
                this.streak = data.streak || 0; // Assuming streak is stored here, or default to 0

                // 2. Fetch Most Recent Lesson (if in groups)
                if (groups.length > 0) {
                    const lessonsQuery = query(
                        collection(firebaseInit.db, "lessons"),
                        where("assignedToGroups", "array-contains-any", groups.slice(0, 30)), // Limit to 30 for 'in' query
                        orderBy("createdAt", "desc"),
                    );

                    // We only need the first one, but onSnapshot is good for real-time
                    onSnapshot(lessonsQuery, (lessonSnap) => {
                        if (!lessonSnap.empty) {
                            const doc = lessonSnap.docs[0];
                            this.recentLesson = { id: doc.id, ...doc.data() };
                        } else {
                            this.recentLesson = null;
                        }
                        this.isLoading = false;
                    }, (error) => {
                        console.error("Dashboard: Error fetching recent lesson:", error);
                        this.isLoading = false;
                    });
                } else {
                    this.isLoading = false;
                }
            } else {
                this.isLoading = false;
            }
        }, (error) => {
            console.error("Dashboard: Error fetching student profile:", error);
            this.isLoading = false;
        });
    }

    _navigateTo(view, lessonId = null) {
        this.dispatchEvent(new CustomEvent('navigate', {
            detail: { view, lessonId },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        if (this.isLoading) {
             return html`
                <div class="flex justify-center items-center min-h-[400px]">
                    <div class="w-10 h-10 border-4 border-indigo-600 rounded-full animate-spin border-t-transparent"></div>
                </div>
            `;
        }

        return html`
            <div class="space-y-8 animate-fade-in">
                <!-- Header -->
                <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 class="text-3xl font-bold text-slate-900">${this.greeting}, ${this.user.email.split('@')[0]}! 👋</h1>
                        <p class="text-slate-500 mt-1">Vítejte ve svém studijním centru.</p>
                    </div>
                    <div class="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100">
                        <span class="text-2xl">🔥</span>
                        <div>
                            <p class="text-xs text-slate-500 uppercase font-bold tracking-wider">Streak</p>
                            <p class="font-bold text-slate-900">${this.streak} dní</p>
                        </div>
                    </div>
                </div>

                <!-- Hero Section: Recent Lesson -->
                ${this.recentLesson ? html`
                    <div class="relative bg-gradient-to-r from-indigo-600 to-purple-600 rounded-3xl p-8 text-white shadow-xl shadow-indigo-200 overflow-hidden group cursor-pointer transition-transform hover:scale-[1.01]"
                         @click="${() => this._navigateTo('lessons', this.recentLesson.id)}">
                        <div class="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>

                        <div class="relative z-10">
                            <span class="inline-block px-3 py-1 bg-white/20 backdrop-blur-md rounded-lg text-xs font-bold uppercase tracking-wider mb-4 border border-white/10">
                                Pokračovat ve výuce
                            </span>
                            <h2 class="text-3xl md:text-4xl font-bold mb-3 max-w-2xl">${this.recentLesson.title}</h2>
                            ${this.recentLesson.subtitle ? html`<p class="text-indigo-100 text-lg mb-8 max-w-xl line-clamp-2">${this.recentLesson.subtitle}</p>` : html`<div class="mb-8"></div>`}

                            <button class="bg-white text-indigo-600 px-6 py-3 rounded-xl font-bold hover:bg-indigo-50 transition-colors shadow-lg shadow-black/5 flex items-center gap-2">
                                Otevřít lekci
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                ` : html`
                     <div class="bg-white rounded-3xl p-8 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
                        <div class="text-4xl mb-3">📚</div>
                        <h3 class="text-xl font-bold text-slate-900">Zatím žádné lekce</h3>
                        <p class="text-slate-500 mt-1">Až se připojíte k nějaké třídě, uvidíte zde nejnovější lekci.</p>
                     </div>
                `}

                <!-- Action Grid -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <!-- My Lessons Card -->
                    <div @click="${() => this._navigateTo('lessons')}"
                         class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg hover:shadow-slate-200 transition-all cursor-pointer group">
                        <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                        </div>
                        <h3 class="text-lg font-bold text-slate-900 mb-1">Moje Lekcie</h3>
                        <p class="text-slate-500 text-sm">Prechádzať všetky dostupné materiály</p>
                    </div>

                    <!-- My Classes Card -->
                    <div @click="${() => this._navigateTo('classes')}"
                         class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg hover:shadow-slate-200 transition-all cursor-pointer group">
                        <div class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                        </div>
                        <div class="flex justify-between items-start">
                            <div>
                                <h3 class="text-lg font-bold text-slate-900 mb-1">Moje Triedy</h3>
                                <p class="text-slate-500 text-sm">Správa tried a skupín</p>
                            </div>
                            <span class="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-1 rounded-lg">
                                ${this.activeClassesCount}
                            </span>
                        </div>
                    </div>

                    <!-- Agenda / Upcoming (Placeholder) -->
                    <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg hover:shadow-slate-200 transition-all cursor-pointer group opacity-60">
                        <div class="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-4">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        </div>
                        <h3 class="text-lg font-bold text-slate-900 mb-1">Agenda</h3>
                        <p class="text-slate-500 text-sm">Nadchádzajúce úlohy (čoskoro)</p>
                    </div>
                </div>
            </div>
        `;
    }
}
customElements.define('student-dashboard-view', StudentDashboardView);
