import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils.js';
import { Localized } from '../../utils/localization-mixin.js';

export class AdminUserManagementView extends Localized(LitElement) {
    static properties = {
        _users: { state: true, type: Array },
        _isLoading: { state: true, type: Boolean },
        _updatingUserId: { state: true, type: String },
        _currentUser: { state: true, type: Object },
        _searchQuery: { state: true, type: String },
        _currentPage: { state: true, type: Number },
    };

    constructor() {
        super();
        this._users = [];
        this._isLoading = true;
        this._updatingUserId = null;
        this._currentUser = getAuth().currentUser;
        this._searchQuery = '';
        this._currentPage = 1;
        this._itemsPerPage = 10;
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
            showToast(this.t('admin.users.toast_load_error'), true);
        } finally {
            this._isLoading = false;
        }
    }

    async _setUserRole(userId, newRole) {
        if (this._updatingUserId) return; 
        this._updatingUserId = userId;

        const setUserRoleCallable = httpsCallable(firebaseInit.functions, 'admin_setUserRole');

        try {
            const result = await setUserRoleCallable({ userId, newRole });
            if (result.data.success) {
                showToast(this.t('admin.users.toast_role_success'), false);
                this._users = this._users.map(user =>
                    user.id === userId ? { ...user, role: newRole } : user
                );
            } else {
                throw new Error(result.data.message || 'Unknown error');
            }
        } catch (error) {
            console.error("Error setting user role:", error);
            showToast(`${this.t('common.error')}: ${error.message}`, true);
        } finally {
            this._updatingUserId = null;
        }
    }

    _handleSearchInput(e) {
        this._searchQuery = e.target.value.toLowerCase();
        this._currentPage = 1; 
    }

    _handlePageChange(newPage) {
        this._currentPage = newPage;
    }

    renderUserRow(user) {
        const isCurrentUser = user.id === this._currentUser.uid;
        const isUpdating = this._updatingUserId === user.id;

        return html`
            <div class="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-4 sm:space-y-0">
                <div class="flex-grow">
                    <p class="font-semibold text-slate-800">${user.email}</p>
                    <p class="text-sm text-slate-500">
                        ${this.t('student.profile.role')}:
                        <span class="font-medium ${user.role === 'professor' ? 'text-green-600' : 'text-blue-600'}">
                            ${user.role || 'N/A'}
                        </span>
                    </p>
                </div>
                <div class="flex-shrink-0 flex items-center space-x-2">
                    ${isCurrentUser
                        ? html`<span class="text-sm font-semibold text-slate-500">${this.t('admin.users.you')}</span>`
                        : isUpdating
                            ? html`<div class="loader text-sm text-slate-500">${this.t('common.loading')}</div>`
                            : html`
                                <button
                                    @click=${() => this._setUserRole(user.id, 'professor')}
                                    .disabled=${user.role === 'professor'}
                                    class="px-3 py-1 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed">
                                    ${this.t('admin.users.promote_professor')}
                                </button>
                                <button
                                    @click=${() => this._setUserRole(user.id, 'student')}
                                    .disabled=${user.role === 'student'}
                                    class="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed">
                                    ${this.t('admin.users.demote_student')}
                                </button>
                            `
                    }
                </div>
            </div>
        `;
    }

    render() {
        const filteredUsers = this._users.filter(user =>
            (user.email || '').toLowerCase().includes(this._searchQuery)
        );

        const totalPages = Math.ceil(filteredUsers.length / this._itemsPerPage);
        const startIndex = (this._currentPage - 1) * this._itemsPerPage;
        const visibleUsers = filteredUsers.slice(startIndex, startIndex + this._itemsPerPage);

        let content;
        if (this._isLoading) {
            content = html`<p class="text-center p-8 text-slate-400">${this.t('common.loading')}</p>`;
        } else if (filteredUsers.length === 0) {
            content = html`<p class="text-center p-8 text-slate-500">${this.t('admin.users.no_users')}</p>`;
        } else {
            content = html`
                <div class="space-y-4">
                    ${visibleUsers.map(user => this.renderUserRow(user))}
                </div>
            `;
        }

        return html`
            <div class="h-full flex flex-col">
                <header class="text-center p-6 border-b border-slate-200 bg-white flex-shrink-0">
                    <h1 class="text-3xl font-extrabold text-slate-800">${this.t('admin.users.title')}</h1>
                    <p class="text-slate-500 mt-1">${this.t('admin.users.subtitle')}</p>
                </header>
                <div class="flex-grow overflow-y-auto p-4 md:p-6 bg-slate-50">
                    <div class="w-full px-6">

                        <div class="mb-6 max-w-2xl mx-auto">
                            <input
                                type="text"
                                placeholder="${this.t('admin.users.search_placeholder')}"
                                .value="${this._searchQuery}"
                                @input="${this._handleSearchInput}"
                                class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                            >
                        </div>

                        ${content}

                        ${totalPages > 1 ? html`
                            <div class="flex justify-center items-center space-x-4 mt-8 pb-4">
                                <button
                                    @click="${() => this._handlePageChange(this._currentPage - 1)}"
                                    .disabled="${this._currentPage === 1}"
                                    class="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                >
                                    ${this.t('common.previous') || 'Zpět'}
                                </button>
                                <span class="text-sm text-slate-600 font-medium">
                                    ${this.t('admin.users.page')} ${this._currentPage} ${this.t('admin.users.of')} ${totalPages}
                                </span>
                                <button
                                    @click="${() => this._handlePageChange(this._currentPage + 1)}"
                                    .disabled="${this._currentPage === totalPages}"
                                    class="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                >
                                    ${this.t('common.next') || 'Další'}
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }
}

customElements.define('admin-user-management-view', AdminUserManagementView);
