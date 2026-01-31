import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { translationService } from '../../utils/translation-service.js';
import { handleLogout } from '../../auth.js';

export class AppNavigation extends LitElement {
    createRenderRoot() { return this; }

    static properties = {
        activeView: { type: String },
        user: { state: true }
    };

    static styles = css`
        :host {
            display: block;
            height: 100%;
        }

        /* Sidebar styles from HTML design */
        .sidebar {
            background: #ffffff;
            border-right: 1px solid #e5e7eb;
            padding: 16px 16px 18px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            height: 100%;
        }

        .logo-row {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 4px 4px 8px;
            cursor: pointer;
        }
        .logo-badge {
            width: 30px;
            height: 30px;
            border-radius: 14px;
            background: radial-gradient(circle at 10% 0%, #4f46e5, #6366f1);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-weight: 700;
            font-size: 17px;
        }
        .logo-text {
            font-weight: 600;
            font-size: 17px;
            color: #111827;
        }

        .nav-section {
            margin-top: 4px;
        }

        .nav-section-label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: .12em;
            color: #6b7280;
            margin: 8px 6px 4px;
            font-weight: 700;
        }

        .nav-list {
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 3px;
            margin-top: 4px;
            padding: 0;
        }

        .nav-item {
            border-radius: 999px;
            padding: 7px 11px;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 9px;
            color: #111827;
            cursor: pointer;
            transition: background .15s ease, box-shadow .15s ease, transform .08s ease;
            background: transparent;
            border: none;
            width: 100%;
            text-align: left;
        }

        .nav-item span.icon {
            width: 20px;
            height: 20px;
            border-radius: 999px;
            background: #f3f4ff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
        }

        .nav-item.active {
            background: linear-gradient(90deg, #4f46e5, #6366f1);
            color: #fff;
            box-shadow: 0 10px 24px rgba(79, 70, 229, .35);
        }
        .nav-item.active span.icon {
            background: rgba(255,255,255,0.18);
            color: #fefefe;
        }

        .nav-item:hover {
            background: #f3f4ff;
            transform: translateY(-1px);
        }
        .nav-item.active:hover {
            background: linear-gradient(90deg, #4f46e5, #4f46e5);
        }
    `;

    constructor() {
        super();
        this.activeView = 'dashboard';
        this.user = getAuth().currentUser;
    }

    connectedCallback() {
        super.connectedCallback();
        // Listen to auth state changes to re-render admin link if needed
        this._authUnsub = getAuth().onAuthStateChanged(user => {
            this.user = user;
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._authUnsub) this._authUnsub();
    }

    _navigateTo(view) {
        this.dispatchEvent(new CustomEvent('navigate', {
            detail: { view },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        const t = (key) => translationService.t(key);
        const isAdmin = this.user?.email === 'profesor@profesor.cz';

        return html`
        <aside data-tour="app-navigation-start" class="sidebar">
            <div>
                <div class="logo-row" @click=${() => this._navigateTo('dashboard')}>
                    <div class="logo-badge">A</div>
                    <div class="logo-text">AI Sensei</div>
                </div>

                <div class="nav-section">
                    <div class="nav-section-label">Organizace</div>
                    <ul class="nav-list">
                        <button class="nav-item ${this.activeView === 'dashboard' ? 'active' : ''}" @click=${() => this._navigateTo('dashboard')}>
                            <span class="icon">🏠</span>
                            <span>Dashboard</span>
                        </button>
                        <button class="nav-item ${this.activeView === 'classes' ? 'active' : ''}" @click=${() => this._navigateTo('classes')}>
                            <span class="icon">🧑‍🏫</span>
                            <span>Moje Třídy</span>
                        </button>
                        <button class="nav-item ${this.activeView === 'students' ? 'active' : ''}" @click=${() => this._navigateTo('students')}>
                            <span class="icon">👥</span>
                            <span>Studenti</span>
                        </button>
                        <button class="nav-item ${this.activeView === 'interactions' ? 'active' : ''}" @click=${() => this._navigateTo('interactions')}>
                            <span class="icon">💬</span>
                            <span>Interakce</span>
                        </button>
                        <button class="nav-item ${this.activeView === 'analytics' ? 'active' : ''}" @click=${() => this._navigateTo('analytics')}>
                            <span class="icon">📊</span>
                            <span>Analýza</span>
                        </button>
                        <button class="nav-item ${this.activeView === 'practice' ? 'active' : ''}" @click=${() => this._navigateTo('practice')}>
                            <span class="icon">🛠️</span>
                            <span>Odborný výcvik</span>
                        </button>
                    </ul>
                </div>

                <div class="nav-section">
                    <div class="nav-section-label">Tvůrčí studio</div>
                    <ul class="nav-list">
                        <button class="nav-item ${this.activeView === 'wizard' ? 'active' : ''}" @click=${() => this._navigateTo('wizard')}>
                            <span class="icon">✨</span>
                            <span>${t('nav.new_module')}</span>
                        </button>
                        <button class="nav-item ${this.activeView === 'library' ? 'active' : ''}" @click=${() => this._navigateTo('library')}>
                            <span class="icon">📚</span>
                            <span>${t('nav.library')}</span>
                        </button>
                        <button class="nav-item ${this.activeView === 'timeline' ? 'active' : ''}" @click=${() => this._navigateTo('timeline')}>
                            <span class="icon">📅</span>
                            <span>${t('nav.timeline')}</span>
                        </button>
                        <button class="nav-item ${this.activeView === 'media' ? 'active' : ''}" @click=${() => this._navigateTo('media')}>
                            <span class="icon">🎞</span>
                            <span>Média &amp; Soubory</span>
                        </button>
                        <button class="nav-item ${this.activeView === 'editor' ? 'active' : ''}" @click=${() => this._navigateTo('editor')}>
                            <span class="icon">✨</span>
                            <span>AI Editor</span>
                        </button>
                    </ul>
                </div>

                ${isAdmin ? html`
                <div class="nav-section">
                    <div class="nav-section-label">Admin</div>
                    <ul class="nav-list">
                        <button class="nav-item ${this.activeView === 'admin-settings' ? 'active' : ''}" @click=${() => this._navigateTo('admin-settings')}>
                            <span class="icon">🛠️</span>
                            <span>Administrace</span>
                        </button>
                        <button class="nav-item ${this.activeView === 'admin' ? 'active' : ''}" @click=${() => this._navigateTo('admin')}>
                            <span class="icon">⚙️</span>
                            <span>Správa uživatelů</span>
                        </button>
                    </ul>
                </div>
                ` : ''}
            </div>
        </aside>
        `;
    }
}

customElements.define('app-navigation', AppNavigation);
