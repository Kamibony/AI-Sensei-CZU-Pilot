import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { baseStyles } from '../../shared-styles.js';

export class StudentInteractionsView extends LitElement {
    static styles = [baseStyles, css`
        :host {
            display: block;
            height: 100%;
        }
        .container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            text-align: center;
            color: #64748b;
        }
        .icon {
            font-size: 4rem;
            margin-bottom: 1rem;
            background: #f1f5f9;
            width: 8rem;
            height: 8rem;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 9999px;
        }
        h2 {
            font-size: 1.5rem;
            font-weight: bold;
            color: #1e293b;
            margin-bottom: 0.5rem;
        }
    `];

    render() {
        return html`
            <div class="container">
                <div class="icon">💬</div>
                <h2>Interakce</h2>
                <p>Coming Soon</p>
            </div>
        `;
    }
}
customElements.define('student-interactions-view', StudentInteractionsView);
