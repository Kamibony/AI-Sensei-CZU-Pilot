// Súbor: public/js/views/professor/editor/ai-generator-panel.js (KOMPLETNÁ OPRAVENÁ VERZIA)

import { LitElement, html, css } from 'lit';
import { consume } from '@lit/context';
import { app, authContext } from '../../../firebase-init.js';
import { callGenerateContent } from '../../../gemini-api.js';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { processAndStoreFile } from '../../../upload-handler.js';

class AiGeneratorPanel extends LitElement {
    @consume({ context: authContext, subscribe: true })
    accessor auth;

    static properties = {
        contentType: { type: String },
        lessonId: { type: String },
        _userPrompt: { type: String, state: true },
        _isGenerating: { type: Boolean, state: true },
        _ragFiles: { type: Array, state: true },
        _uploading: { type: Boolean, state: true },
        _uploadProgress: { type: Number, state: true },
    };

    static styles = css`
        :host {
            display: block;
            border: 1px solid #e2e8f0;
            border-radius: 0.5rem;
        }
        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem 1rem;
            background-color: #f7fafc;
            border-top-left-radius: 0.5rem;
            border-top-right-radius: 0.5rem;
            border-bottom: 1px solid #e2e8f0;
        }
        .panel-header h3 {
            margin: 0;
            font-size: 1rem;
            font-weight: 600;
        }
        .panel-body {
            padding: 1rem;
        }
        textarea {
            width: 100%;
            min-height: 100px;
            border: 1px solid #cbd5e0;
            border-radius: 0.375rem;
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
            box-sizing: border-box; /* Pridané pre správne zobrazenie */
        }
        .rag-section {
            margin-top: 1rem;
        }
        .file-list {
            font-size: 0.875rem;
            color: #4a5568;
        }
        .file-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.25rem 0;
        }
        .file-item button {
            background: none;
            border: none;
            color: #e53e3e;
            cursor: pointer;
            font-size: 0.75rem;
        }
        .progress-bar {
            width: 100%;
            background-color: #e2e8f0;
            border-radius: 0.375rem;
            overflow: hidden;
            height: 8px;
            margin-top: 0.5rem;
        }
        .progress-bar div {
            width: 0;
            height: 100%;
            background-color: #4299e1;
            transition: width 0.3s ease-in-out;
        }
        .generate-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0.5rem 1rem;
            font-size: 0.875rem;
            font-weight: 500;
            border-radius: 0.375rem;
            border: 1px solid transparent;
            color: #fff;
            background-color: #4299e1;
            cursor: pointer;
            transition: background-color 0.2s;
            width: 100%;
            margin-top: 1rem;
        }
        .generate-btn:hover {
            background-color: #3182ce;
        }
        .generate-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .spinner {
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: #fff;
            animation: spin 1s ease-in-out infinite;
            margin-right: 0.5rem;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `;

    constructor() {
        super();
        this._userPrompt = '';
        this._isGenerating = false;
        this._ragFiles = [];
        this._uploading = false;
        this._uploadProgress = 0;
    }

    dispatch(name, detail) {
        this.dispatchEvent(new CustomEvent(name, {
            detail,
            bubbles: true,
            composed: true
        }));
    }

    async _handleGeneration() {
        if (!this.auth?.uid) {
            this.dispatch('show-toast', { message: 'Nejste přihlášen.', type: 'error' });
            return;
        }

        this._isGenerating = true;
        this._userPrompt = this.shadowRoot.querySelector('#user-prompt-input').value;

        if (!this._userPrompt) {
            this.dispatch('show-toast', { message: 'Zadejte prosím téma.', type: 'error' });
            this._isGenerating = false;
            return;
        }
        
        const promptData = {
            userPrompt: this._userPrompt,
        };

        const slottedInputs = this.shadowRoot.querySelector('slot[name="ai-inputs"]').assignedElements({ flatten: true });
        
        for (const input of slottedInputs) {
            const inputEl = input.shadowRoot ? input.shadowRoot.querySelector('input') : input.querySelector('input');
            
            if (inputEl && inputEl.id) {
                const key = inputEl.id.replace(/-/g, '_').replace('_input', '');
                promptData[key] = inputEl.value;
            } else if (input.id) {
                const key = input.id.replace(/-/g, '_').replace('_input', '');
                promptData[key] = input.value;
            }
        }
        
        // ===== PRIDANÁ VALIDÁCIA NA FRONTENDE =====
        if (this.contentType === 'presentation') {
            const count = parseInt(promptData.slide_count, 10);
            if (!count || count <= 0) {
                // Zobrazí chybu lokálne bez volania servera
                this.dispatch('show-toast', { 
                    message: `Neplatný počet slidů. Zadejte prosím kladné číslo.`, 
                    type: 'error' 
                });
                this._isGenerating = false; // Zastaví spinner
                return; // Zastaví funkciu
            }
        }
        // ===== KONIEC VALIDÁCIE =====

        const ragFilePaths = this._ragFiles.map(f => f.storagePath);

        try {
            this.dispatch('generation-started');
            const result = await callGenerateContent(this.contentType, promptData, ragFilePaths);
            this.dispatch('generation-success', { ...result, contentType: this.contentType });
        } catch (error) {
            console.error("Error during AI generation:", error);
            const errorMessage = error.message.includes(":") ? error.message.split(":")[1].trim() : "Došlo k chybě.";
            this.dispatch('show-toast', { message: `Backend Error: ${errorMessage}`, type: 'error' });
        } finally {
            this._isGenerating = false;
        }
    }

    _handleFileInput(e) {
        const files = e.target.files;
        if (!files.length || !this.auth?.uid) {
            return;
        }
        if (!this.lessonId) {
            this.dispatch('show-toast', { message: 'Nejprve lekci uložte, poté můžete nahrávat soubory.', type: 'error' });
            return;
        }

        const file = files[0];
        this._uploading = true;
        
        processAndStoreFile(file, this.lessonId, this.auth.uid, 
            (progress) => {
                this._uploadProgress = progress;
            },
            (error) => {
                this._uploading = false;
                this.dispatch('show-toast', { message: `Chyba nahrávání: ${error.message}`, type: 'error' });
            },
            (downloadURL, storagePath) => {
                this._uploading = false;
                this._uploadProgress = 0;
                this._ragFiles = [...this._ragFiles, { name: file.name, storagePath }];
                this.dispatch('show-toast', { message: 'Soubor nahrán a zpracován.', type: 'success' });
            }
        );
    }

    _removeFile(fileToRemove) {
        this._ragFiles = this._ragFiles.filter(file => file.storagePath !== fileToRemove.storagePath);
        // TODO: Pridať logiku na zmazanie súboru zo Storage, ak je to potrebné
    }

    render() {
        return html`
            <div class="panel-header">
                <h3>Vstup pro AI</h3>
                <span class="text-sm font-medium text-gray-500">${this.contentType}</span>
            </div>
            <div class="panel-body">
                <slot name="ai-inputs"></slot>
                
                <div class="mb-4">
                    <label for="user-prompt-input" class="block text-sm font-medium text-gray-700 mb-1">Téma / Zadání</label>
                    <textarea
                        id="user-prompt-input"
                        class="w-full border-gray-300 rounded-md shadow-sm"
                        rows="4"
                        placeholder="Např. 'Historie a význam operního pěvce Enrica Carusa'"
                        .value=${this._userPrompt}
                        @input=${e => this._userPrompt = e.target.value}
                    ></textarea>
                </div>

                <div class="rag-section">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Přidat soubor (RAG)</label>
                    <input type="file" @change=${this._handleFileInput} class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                    
                    ${this._uploading ? html`
                        <div class="progress-bar">
                            <div style="width: ${this._uploadProgress}%"></div>
                        </div>
                    ` : ''}

                    ${this._ragFiles.length > 0 ? html`
                        <div class="file-list mt-2">
                            <strong>Nahrané soubory:</strong>
                            ${this._ragFiles.map(file => html`
                                <div class="file-item">
                                    <span>${file.name}</span>
                                    <button @click=${() => this._removeFile(file)}>Odebrat</button>
                                </div>
                            `)}
                        </div>
                    ` : ''}
                </div>

                <button
                    class="generate-btn"
                    @click=${this._handleGeneration}
                    .disabled=${this._isGenerating || this._uploading}
                >
                    ${this._isGenerating ? html`<div class="spinner"></div> Generuji...` : 'Generovat'}
                </button>
            </div>
        `;
    }
}

customElements.define('ai-generator-panel', AiGeneratorPanel);
