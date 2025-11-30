import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';
import { translationService } from '../../utils/translation-service.js';

export class ProfessorClassesView extends LitElement {
    static properties = {
        _classes: { state: true, type: Array },
        _isLoading: { state: true, type: Boolean },
    };

    constructor() {
        super();
        this._classes = [];
        this._isLoading = true;
        this.classesUnsubscribe = null;
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._fetchClasses();
        this._langUnsubscribe = translationService.subscribe(() => this.requestUpdate());
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.classesUnsubscribe) {
            this.classesUnsubscribe();
        }
        if (this._langUnsubscribe) {
            this._langUnsubscribe();
        }
    }

    _fetchClasses() {
        const user = firebaseInit.auth.currentUser;
        if (!user) {
            this._isLoading = false;
            return;
        }

        let q;
        if (user.email === 'profesor@profesor.cz') {
             q = query(collection(firebaseInit.db, 'groups'));
        } else {
             q = query(collection(firebaseInit.db, 'groups'), where("ownerId", "==", user.uid));
        }

        this.classesUnsubscribe = onSnapshot(q, (querySnapshot) => {
            this._classes = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this._isLoading = false;
        }, (error) => {
            console.error("Error fetching classes:", error);
            showToast(translationService.t('classes.fetch_error'), true);
            this._isLoading = false;
        });
    }

    _generateJoinCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    async _handleCreateClass() {
        const className = prompt(translationService.t('dashboard.enter_class_name'), "");
        if (className && className.trim() !== "") {
            const user = firebaseInit.auth.currentUser;
            if (!user) {
                showToast(translationService.t('classes.login_required_create'), true);
                return;
            }

            try {
                // Unique Name Check
                const q = query(
                    collection(firebaseInit.db, 'groups'),
                    where("ownerId", "==", user.uid),
                    where("name", "==", className.trim())
                );
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    showToast("Třída s tímto názvem již existuje.", true);
                    return;
                }

                await addDoc(collection(firebaseInit.db, 'groups'), {
                    name: className.trim(),
                    ownerId: user.uid,
                    joinCode: this._generateJoinCode(),
                    studentIds: [],
                    createdAt: serverTimestamp()
                });
                showToast(translationService.t('classes.created_success'));
            } catch (error) {
                console.error("Error creating class:", error);
                showToast(translationService.t('professor.error_create_class'), true);
            }
        }
    }

    _navigateToClass(groupId) {
        this.dispatchEvent(new CustomEvent('navigate', {
            detail: { view: 'class-detail', groupId: groupId },
            bubbles: true,
            composed: true
        }));
    }

    _copyJoinCode(e, code) {
        e.stopPropagation();
        navigator.clipboard.writeText(code).then(() => {
            showToast(translationService.t('common.code_copied'));
        }, () => {
            showToast(translationService.t('common.copy_failed'), true);
        });
    }

    render() {
        const t = (key) => translationService.t(key);
        return html`
            <div class="h-full flex flex-col bg-slate-50">
                <header class="bg-white p-6 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h1 class="text-3xl font-extrabold text-slate-800 tracking-tight">${t('classes.manage_title')}</h1>
                        <p class="text-slate-500 mt-1 font-medium">${t('classes.manage_desc')}</p>
                    </div>
                    <button @click=${this._handleCreateClass} class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-6 rounded-full flex items-center shadow-lg shadow-indigo-200 transition-all transform hover:scale-105">
                        <span class="mr-2">➕</span> ${t('classes.create_new')}
                    </button>
                </header>

                <div class="flex-grow overflow-y-auto p-6">
                    <div>
                        ${this._isLoading
                            ? html`
                                <div class="flex justify-center items-center h-64">
                                    <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                                </div>`
                            : this._renderClassesGrid()}
                    </div>
                </div>
            </div>
        `;
    }

    _renderClassesGrid() {
        const t = (key) => translationService.t(key);
        if (this._classes.length === 0) {
            return html`
                <div class="text-center p-12 bg-white rounded-3xl shadow-sm border border-slate-100 max-w-2xl mx-auto mt-10">
                    <div class="inline-flex items-center justify-center w-20 h-20 bg-indigo-50 rounded-full mb-6 text-indigo-500">
                        <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                    </div>
                    <h3 class="text-2xl font-bold text-slate-800 mb-3">${t('dashboard.no_classes_title')}</h3>
                    <p class="text-slate-500 mb-8 max-w-md mx-auto leading-relaxed">${t('dashboard.no_classes_desc')}</p>
                    <button @click=${this._handleCreateClass} class="text-indigo-600 font-bold hover:text-indigo-800 hover:underline text-lg">
                        ${t('dashboard.create_first_class')} &rarr;
                    </button>
                </div>
            `;
        }

        return html`
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                ${this._classes.map(cls => this._renderClassCard(cls))}
            </div>
        `;
    }

    _renderClassCard(cls) {
        const t = (key) => translationService.t(key);
        const studentCount = (cls.studentIds || []).length;

        const initials = cls.name ? cls.name.substring(0, 2).toUpperCase() : "??";

        // Dynamic gradient based on name char code sum
        const colors = [
            'from-blue-500 to-cyan-400',
            'from-purple-500 to-fuchsia-500',
            'from-indigo-500 to-violet-500',
            'from-emerald-500 to-teal-400',
            'from-rose-500 to-pink-500',
            'from-orange-500 to-amber-500'
        ];
        const hash = cls.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const bgGradient = colors[hash % colors.length];

        return html`
            <div @click=${() => this._navigateToClass(cls.id)}
                 class="bg-white rounded-2xl border border-slate-100 shadow-lg hover:shadow-xl transition-all duration-300 p-6 relative group cursor-pointer h-full flex flex-col">

                <!-- Action: Copy Code (Absolute top-right) -->
                <button @click=${(e) => this._copyJoinCode(e, cls.joinCode)}
                        class="absolute top-5 right-5 p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors opacity-80 hover:opacity-100"
                        title="${t('classes.copy_code_tooltip')}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                </button>

                <!-- Icon -->
                <div class="w-16 h-16 rounded-2xl bg-gradient-to-br ${bgGradient} text-white flex items-center justify-center text-2xl font-bold shadow-md shadow-slate-200 mb-6 transform group-hover:scale-105 transition-transform duration-300">
                    ${initials}
                </div>

                <!-- Content -->
                <div class="flex-grow">
                    <h3 class="text-xl font-bold text-slate-800 mb-2 group-hover:text-indigo-600 transition-colors line-clamp-1">${cls.name}</h3>
                    <div class="flex items-center text-slate-500 text-sm font-medium">
                         <svg class="w-4 h-4 mr-2 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                         ${studentCount} ${t('classes.student_count_label')}
                    </div>
                </div>

                <!-- Code (kept for utility but subtle) -->
                <div class="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between opacity-70 group-hover:opacity-100 transition-opacity">
                     <span class="text-xs text-slate-400 font-bold uppercase tracking-wider">${t('classes.join_code_label')}</span>
                     <code class="font-mono text-sm font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded select-all">${cls.joinCode}</code>
                </div>
            </div>
        `;
    }
}

customElements.define('professor-classes-view', ProfessorClassesView);
