import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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

        const q = query(collection(firebaseInit.db, 'groups'), where("ownerId", "==", user.uid));
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
                <header class="bg-white p-6 border-b border-slate-200 flex items-center justify-between">
                    <div>
                        <h1 class="text-3xl font-extrabold text-slate-800">${t('classes.manage_title')}</h1>
                        <p class="text-slate-500 mt-1">${t('classes.manage_desc')}</p>
                    </div>
                    <button @click=${this._handleCreateClass} class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg flex items-center shadow-lg shadow-indigo-200 transition-all">
                        <span class="mr-2">➕</span> ${t('classes.create_new')}
                    </button>
                </header>

                <div class="flex-grow overflow-y-auto p-6">
                    <div class="max-w-7xl mx-auto">
                        ${this._isLoading
                            ? html`<p class="text-center p-8 text-slate-400">${t('classes.loading')}</p>`
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
                <div class="text-center p-12 bg-white rounded-3xl shadow-sm border border-slate-100">
                    <div class="inline-block p-4 bg-slate-50 rounded-full mb-4">
                        <span class="text-4xl">🏫</span>
                    </div>
                    <h3 class="text-xl font-bold text-slate-800 mb-2">${t('dashboard.no_classes_title')}</h3>
                    <p class="text-slate-500 mb-6">${t('dashboard.no_classes_desc')}</p>
                    <button @click=${this._handleCreateClass} class="text-indigo-600 font-medium hover:text-indigo-800 hover:underline">
                        ${t('dashboard.create_first_class')}
                    </button>
                </div>
            `;
        }

        return html`
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${this._classes.map(cls => this._renderClassCard(cls))}
            </div>
        `;
    }

    _renderClassCard(cls) {
        const t = (key) => translationService.t(key);
        const studentCount = (cls.studentIds || []).length;
        return html`
            <div @click=${() => this._navigateToClass(cls.id)}
                 class="bg-white p-6 rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
                <div class="flex justify-between items-start mb-4">
                    <h3 class="text-xl font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">${cls.name}</h3>
                    <div class="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold uppercase tracking-wide">
                        ${studentCount} ${t('classes.student_count_label')}
                    </div>
                </div>

                <div class="flex items-center justify-between mt-6 pt-4 border-t border-slate-50">
                    <div class="flex flex-col">
                        <span class="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">${t('classes.join_code_label')}</span>
                        <div class="flex items-center space-x-2">
                            <code class="font-mono text-lg font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">${cls.joinCode}</code>
                            <button @click=${(e) => this._copyJoinCode(e, cls.joinCode)} class="text-slate-400 hover:text-indigo-600 p-1 rounded-full hover:bg-slate-100 transition-colors" title="${t('classes.copy_code_tooltip')}">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                            </button>
                        </div>
                    </div>
                    <div class="text-slate-300 group-hover:text-indigo-600 transition-colors">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('professor-classes-view', ProfessorClassesView);
