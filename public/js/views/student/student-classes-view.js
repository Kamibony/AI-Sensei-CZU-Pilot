import { LitElement, html, nothing } from 'https://cdn.skypack.dev/lit';
import { doc, onSnapshot, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { translationService } from '../../utils/translation-service.js';

export class StudentClassesView extends LitElement {
    static properties = {
        _groups: { type: Array, state: true },
        _isLoading: { type: Boolean, state: true }
    };

    createRenderRoot() { return this; }

    constructor() {
        super();
        this._groups = [];
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
                const groupIds = data.memberOfGroups || [];

                if (groupIds.length > 0) {
                    await this._fetchGroupsInfo(groupIds);
                } else {
                    this._groups = [];
                    this._isLoading = false;
                }
            } else {
                this._isLoading = false;
            }
        });
    }

    async _fetchGroupsInfo(groupIds) {
        const safeGroupIds = groupIds.slice(0, 30);
        if (safeGroupIds.length === 0) return;

        try {
            const q = query(collection(firebaseInit.db, "groups"), where("__name__", "in", safeGroupIds));
            const querySnapshot = await getDocs(q);
            this._groups = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching groups:", error);
            this._groups = [];
        } finally {
            this._isLoading = false;
        }
    }

    _handleJoinClassClick() {
        // Dispatch event to parent (student.js) to handle the global join logic
        const event = new CustomEvent('request-join-class', { bubbles: true, composed: true });
        this.dispatchEvent(event);
    }

    _handleClassClick(groupId) {
        const event = new CustomEvent('class-selected', {
            detail: { groupId: groupId },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(event);
    }

    render() {
        // Use t() where possible, but hardcode requested new Czech strings if keys are missing
        const t = (key, defaultText) => {
             const val = translationService.t(key);
             return (val && val !== key) ? val : defaultText;
        };

        if (this._isLoading) {
            return html`
                <div class="flex justify-center items-center h-full min-h-[50vh]">
                     <div class="spinner w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>`;
        }

        return html`
            <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div class="flex items-center justify-between mb-8">
                    <div>
                        <h2 class="text-3xl font-extrabold text-slate-900 tracking-tight">Moje Třídy</h2>
                        <p class="text-slate-500 mt-1">Přehled tříd, ve kterých jste členem</p>
                    </div>
                    <button @click=${this._handleJoinClassClick}
                        class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-5 rounded-xl shadow-lg shadow-indigo-200 transition-all transform active:scale-95 flex items-center gap-2">
                        <span>+</span> Připojit se k třídě
                    </button>
                </div>

                ${this._groups.length > 0 ? html`
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        ${this._groups.map(group => html`
                            <div @click=${() => this._handleClassClick(group.id)} class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center justify-between cursor-pointer group">
                                <div class="flex items-center gap-4">
                                    <div class="w-14 h-14 rounded-xl bg-slate-50 text-slate-500 flex items-center justify-center font-bold text-xl">
                                        ${group.name.substring(0, 1).toUpperCase()}
                                    </div>
                                    <div>
                                        <h4 class="font-bold text-slate-800 text-lg group-hover:text-indigo-600 transition-colors">${group.name}</h4>
                                        <p class="text-sm text-slate-400 flex items-center gap-1">
                                            👨‍🏫 ${group.ownerName || 'Učitel'}
                                        </p>
                                    </div>
                                </div>
                                <div class="text-slate-300 group-hover:text-indigo-600 transition-colors">
                                    →
                                </div>
                            </div>
                        `)}
                    </div>
                ` : html`
                    <div class="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200">
                        <div class="text-5xl mb-4">🏫</div>
                        <h3 class="text-xl font-bold text-slate-800">Zatím nejsou žádné třídy</h3>
                        <p class="text-slate-500 mt-2 mb-6">Připojte se pomocí kódu od vašeho profesora.</p>
                        <button @click=${this._handleJoinClassClick} class="text-indigo-600 font-bold hover:underline">
                            Připojit se teď
                        </button>
                    </div>
                `}
            </div>
        `;
    }
}
customElements.define('student-classes-view', StudentClassesView);
