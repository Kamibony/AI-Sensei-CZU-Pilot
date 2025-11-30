import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';

export class AdminUserManagementView extends LitElement {
    static properties = {
        _users: { state: true, type: Array },
        _isLoading: { state: true, type: Boolean },
        _updatingUserId: { state: true, type: String },
        _currentUser: { state: true, type: Object },
    };

    constructor() {
        super();
        this._users = [];
        this._isLoading = true;
        this._updatingUserId = null;
        this._currentUser = getAuth().currentUser;
    }

    createRenderRoot() { return this; }

    connectedCallback() {
        super.connectedCallback();
        this._fetchUsers();
    }

    async _fetchUsers() {
        this._isLoading = true;
        try {
            const usersSnapshot = await getDocs(collection(firebaseInit.db, 'users'));
            this._users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching users:", error);
            showToast("Nepodařilo se načíst seznam uživatelů.", true);
        } finally {
            this._isLoading = false;
        }
    }

    async _setUserRole(userId, newRole) {
        if (this._updatingUserId) return; // Prevent multiple requests
        this._updatingUserId = userId;

        const setUserRoleCallable = httpsCallable(firebaseInit.functions, 'admin_setUserRole');

        try {
            const result = await setUserRoleCallable({ userId, newRole });
            if (result.data.success) {
                showToast("Role uživatele byla úspěšně změněna.", false);
                // Update the local state to reflect the change immediately
                this._users = this._users.map(user =>
                    user.id === userId ? { ...user, role: newRole } : user
                );
            } else {
                throw new Error(result.data.message || 'Unknown error');
            }
        } catch (error) {
            console.error("Error setting user role:", error);
            showToast(`Chyba: ${error.message}`, true);
        } finally {
            this._updatingUserId = null;
        }
    }

    renderUserRow(user) {
        const isCurrentUser = user.id === this._currentUser.uid;
        const isUpdating = this._updatingUserId === user.id;

        return html`
            <div class="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-4 sm:space-y-0">
                <div class="flex-grow">
                    <p class="font-semibold text-slate-800">${user.email}</p>
                    <p class="text-sm text-slate-500">
                        Role:
                        <span class="font-medium ${user.role === 'professor' ? 'text-green-600' : 'text-blue-600'}">
                            ${user.role || 'N/A'}
                        </span>
                    </p>
                </div>
                <div class="flex-shrink-0 flex items-center space-x-2">
                    ${isCurrentUser
                        ? html`<span class="text-sm font-semibold text-slate-500">(Toto jste vy)</span>`
                        : isUpdating
                            ? html`<div class="loader text-sm text-slate-500">Aktualizuji...</div>`
                            : html`
                                <button
                                    @click=${() => this._setUserRole(user.id, 'professor')}
                                    .disabled=${user.role === 'professor'}
                                    class="px-3 py-1 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed">
                                    Povýšit na Profesora
                                </button>
                                <button
                                    @click=${() => this._setUserRole(user.id, 'student')}
                                    .disabled=${user.role === 'student'}
                                    class="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed">
                                    Snížit na Studenta
                                </button>
                            `
                    }
                </div>
            </div>
        `;
    }

    render() {
        let content;
        if (this._isLoading) {
            content = html`<p class="text-center p-8 text-slate-400">Načítám uživatele...</p>`;
        } else if (this._users.length === 0) {
            content = html`<p class="text-center p-8 text-slate-500">Nebyly nalezeni žádní uživatelé.</p>`;
        } else {
            content = html`
                <div class="space-y-4">
                    ${this._users.map(user => this.renderUserRow(user))}
                </div>
            `;
        }

        return html`
            <div class="h-full flex flex-col">
                <header class="text-center p-6 border-b border-slate-200 bg-white flex-shrink-0">
                    <h1 class="text-3xl font-extrabold text-slate-800">Správa rolí uživatelů</h1>
                    <p class="text-slate-500 mt-1">Přiřazujte role profesorů a studentů.</p>
                </header>
                <div class="flex-grow overflow-y-auto p-4 md:p-6 bg-slate-50">
                    <div class="w-full px-6">
                        ${content}
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('admin-user-management-view', AdminUserManagementView);
