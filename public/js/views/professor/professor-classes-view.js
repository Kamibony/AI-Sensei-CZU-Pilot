// public/js/views/professor/professor-classes-view.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';

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
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this.classesUnsubscribe) {
            this.classesUnsubscribe();
        }
    }

    _fetchClasses() {
        const user = firebaseInit.auth.currentUser;
        if (!user) return;

        const q = query(collection(firebaseInit.db, 'groups'), where("ownerId", "==", user.uid));
        this.classesUnsubscribe = onSnapshot(q, (querySnapshot) => {
            this._classes = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this._isLoading = false;
        }, (error) => {
            console.error("Error fetching classes:", error);
            showToast("Nepodařilo se načíst třídy.", true);
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
        const className = prompt("Zadejte název nové třídy:", "Např. Matematika 1.A");
        if (className && className.trim() !== "") {
            const user = firebaseInit.auth.currentUser;
            if (!user) {
                showToast("Pro vytvoření třídy musíte být přihlášeni.", true);
                return;
            }

            try {
                await addDoc(collection(firebaseInit.db, 'groups'), {
                    name: className.trim(),
                    ownerId: user.uid,
                    joinCode: this._generateJoinCode(),
                    createdAt: serverTimestamp()
                });
                showToast("Třída byla úspěšně vytvořena.");
            } catch (error) {
                console.error("Error creating class:", error);
                showToast("Chyba při vytváření třídy.", true);
            }
        }
    }

    render() {
        return html`
            <header class="text-center p-6 border-b border-slate-200 bg-white">
                <h1 class="text-3xl font-extrabold text-slate-800">Správa Tříd</h1>
                <p class="text-slate-500 mt-1">Vytvářejte a spravujte své třídy pro studenty.</p>
            </header>
            <div class="flex-grow overflow-y-auto p-4 md:p-6">
                <div class="max-w-4xl mx-auto">
                    <div class="bg-white p-6 rounded-2xl shadow-lg mb-6">
                        <div class="flex justify-between items-center">
                            <h2 class="text-xl font-bold text-slate-700">Vaše Třídy</h2>
                            <button @click=${this._handleCreateClass} class="bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded-lg transition transform hover:scale-105">
                                Vytvořit novou třídu
                            </button>
                        </div>
                    </div>

                    <div id="classes-list-container" class="bg-white p-6 rounded-2xl shadow-lg">
                        ${this._isLoading ? html`<p class="text-center p-8 text-slate-400">Načítám třídy...</p>` : this._renderClassesList()}
                    </div>
                </div>
            </div>
        `;
    }

    _renderClassesList() {
        if (this._classes.length === 0) {
            return html`
                <div class="text-center p-8">
                    <p class="text-slate-500 mb-4">Zatím jste nevytvořili žádnou třídu.</p>
                    <p class="text-slate-400">Klikněte na tlačítko "Vytvořit novou třídu" pro přidání vaší první třídy.</p>
                </div>
            `;
        }

        return html`
            <div class="divide-y divide-slate-100">
                ${this._classes.map(cls => html`
                    <div class="class-row flex items-center justify-between p-4">
                        <div>
                            <p class="text-slate-800 font-semibold">${cls.name}</p>
                        </div>
                        <div class="flex items-center space-x-4">
                            <span class="text-sm text-slate-500">Kód pro připojení:</span>
                            <strong class="text-lg font-mono bg-slate-100 text-slate-700 px-3 py-1 rounded-md">${cls.joinCode}</strong>
                        </div>
                    </div>
                `)}
            </div>
        `;
    }
}

customElements.define('professor-classes-view', ProfessorClassesView);
