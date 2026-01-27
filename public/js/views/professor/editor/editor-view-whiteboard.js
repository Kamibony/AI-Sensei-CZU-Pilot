import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { Localized } from '../../../utils/localization-mixin.js';
import '../../../components/magic-board-view.js';
import './professor-header-editor.js';

export class EditorViewWhiteboard extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        isSaving: { type: Boolean }
    };

    createRenderRoot() { return this; } // Light DOM enabled

    render() {
        return html`
            <div data-tour="editor-whiteboard-start" data-editor-type="whiteboard" class="h-full flex flex-col bg-slate-50 relative">
                <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}"></professor-header-editor>
                <div class="flex-1 p-6 overflow-hidden" data-tour="whiteboard-container">
                    <magic-board-view .lessonId="${this.lesson.id}"></magic-board-view>
                </div>
            </div>
        `;
    }
}
customElements.define('editor-view-whiteboard', EditorViewWhiteboard);
