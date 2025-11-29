import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { baseStyles } from '../../shared-styles.js';

export class StudentNavigation extends LitElement {
    static properties = {
        activeView: { type: String }
    };

    static styles = [baseStyles, css`
        :host {
            display: block;
            height: 100%;
            background: white;
            border-right: 1px solid #e2e8f0; /* slate-200 */
        }
        nav {
            display: flex;
            flex-direction: column;
            padding: 1rem;
            gap: 0.5rem;
        }
        .nav-item {
            display: flex;
            align-items: center;
            padding: 0.75rem 1rem;
            border-radius: 0.75rem;
            color: #64748b; /* slate-500 */
            cursor: pointer;
            transition: all 0.2s;
            font-weight: 500;
            text-decoration: none;
            border-left: 4px solid transparent;
        }
        .nav-item:hover {
            background-color: #f8fafc; /* slate-50 */
            color: #0f172a; /* slate-900 */
        }
        .nav-item.active {
            background-color: #f8fafc; /* slate-50 */
            color: #4f46e5; /* indigo-600 */
            border-left-color: #6366f1; /* indigo-500 */
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        }
        .icon {
            margin-right: 0.75rem;
            font-size: 1.25rem;
        }
        .logo-area {
            height: 5rem;
            display: flex;
            align-items: center;
            padding: 0 1.5rem;
            margin-bottom: 1rem;
        }
        .logo-box {
            width: 2rem;
            height: 2rem;
            background-color: #4f46e5;
            color: white;
            border-radius: 0.5rem;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);
        }
        .logo-text {
            margin-left: 0.75rem;
            font-weight: bold;
            color: #1e293b;
            font-size: 1.125rem;
        }
    `];

    _handleNav(view) {
        this.dispatchEvent(new CustomEvent('navigate', {
            detail: { view },
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
            <div class="logo-area">
                <div class="logo-box">A</div>
                <span class="logo-text">AI Sensei</span>
            </div>
            <nav>
                <a class="nav-item ${this.activeView === 'dashboard' ? 'active' : ''}"
                   @click=${() => this._handleNav('dashboard')}>
                    <span class="icon">🏠</span>
                    Dashboard
                </a>
                <a class="nav-item ${this.activeView === 'classes' ? 'active' : ''}"
                   @click=${() => this._handleNav('classes')}>
                    <span class="icon">🏫</span>
                    Moje Třídy
                </a>
                <a class="nav-item ${this.activeView === 'interactions' ? 'active' : ''}"
                   @click=${() => this._handleNav('interactions')}>
                    <span class="icon">💬</span>
                    Interakce
                </a>
            </nav>
        `;
    }
}
customElements.define('student-navigation', StudentNavigation);
