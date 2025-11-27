
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

// Mock gemini-api
const originalCallGenerateContent = window.callGenerateContent;

window.callGenerateContent = async (data) => {
    console.log("MOCKED callGenerateContent called with:", JSON.stringify(data, null, 2));

    // Determine type
    let result = {};
    if (typeof data === 'string') {
         // Old style call, which we are fixing.
         console.warn("MOCKED callGenerateContent called with STRING (Should be object!)");
    }

    const contentType = data.contentType;

    await new Promise(r => setTimeout(r, 500)); // Delay

    if (contentType === 'flashcards') {
        result = {
            text: JSON.stringify([
                { front: "Test Card 1", back: "Back 1" },
                { front: "Test Card 2", back: "Back 2" }
            ])
        };
    } else if (contentType === 'mindmap') {
        result = {
            text: "graph TD\n    A[Start] --> B[End]"
        };
    } else {
         result = { text: "Generic text content" };
    }

    return result;
};

import { EditorViewFlashcards } from './public/js/views/professor/editor/editor-view-flashcards.js';
import { EditorViewMindmap } from './public/js/views/professor/editor/editor-view-mindmap.js';

// Create a simple harness
class TestHarness extends LitElement {
    static properties = {
        view: { state: true }
    };

    constructor() {
        super();
        this.view = 'flashcards';
        this.lesson = {
            id: 'test-lesson-id',
            title: 'Test Lesson',
            ragFilePaths: [{ fullPath: 'path/to/file.pdf' }]
        };
    }

    createRenderRoot() { return this; }

    render() {
        return html`
            <div class="p-4">
                <div class="mb-4 space-x-4">
                    <button @click=${() => this.view = 'flashcards'} class="px-4 py-2 bg-blue-500 text-white rounded">Flashcards</button>
                    <button @click=${() => this.view = 'mindmap'} class="px-4 py-2 bg-green-500 text-white rounded">Mindmap</button>
                </div>

                <div class="border p-4 rounded bg-gray-100">
                    ${this.view === 'flashcards'
                        ? html`<editor-view-flashcards .lesson=${this.lesson}></editor-view-flashcards>`
                        : html`<editor-view-mindmap .lesson=${this.lesson}></editor-view-mindmap>`
                    }
                </div>
            </div>
        `;
    }
}
customElements.define('test-harness', TestHarness);

document.body.innerHTML = '<test-harness></test-harness>';
