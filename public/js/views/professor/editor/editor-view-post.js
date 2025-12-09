import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { translationService } from '../../../utils/translation-service.js';
import './ai-generator-panel.js';

export class EditorViewPost extends LitElement {
    static properties = {
        lesson: { type: Object },
    };

    createRenderRoot() { return this; }

    render() {
        const defaultPrompt = translationService.t('editor.post_default_prompt', { title: this.lesson?.title || 'aktuální lekce' });
        
        const podcastConfig = [
            {
                id: 'episode_count',
                type: 'number',
                label: 'Počet epizod',
                default: 3,
                min: 1,
                max: 10
            }
        ];

        return html`
            <ai-generator-panel
                .lesson=${this.lesson}
                viewTitle="Podcast Skript"
                contentType="post"
                fieldToUpdate="podcast_script"
                description="Vytvořte sérii podcastových skriptů."
                .promptPlaceholder=${defaultPrompt}
                .inputsConfig=${podcastConfig}
            >
            </ai-generator-panel>
        `;
    }
}
customElements.define('editor-view-post', EditorViewPost);
