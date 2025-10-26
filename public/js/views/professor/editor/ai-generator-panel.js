// public/js/views/professor/editor/ai-generator-panel.js
import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, updateDoc, deleteField, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import * as firebaseInit from '../../../firebase-init.js';
import { showToast } from '../../../utils.js';
import { renderSelectedFiles, getSelectedFiles, renderMediaLibraryFiles } from '../../../upload-handler.js';

let generateContentCallable = null;

// === Definícia Štýlov Tlačidiel ===
const btnBase = "px-5 py-2 font-semibold rounded-lg transition transform hover:scale-105 disabled:opacity-50 disabled:scale-100 flex items-center justify-center";
const btnPrimary = `${btnBase} bg-green-700 text-white hover:bg-green-800`; // Uložiť
const btnGenerate = `${btnBase} bg-amber-600 text-white hover:bg-amber-700 ai-glow`; // Generovať
const btnSecondary = `${btnBase} bg-slate-200 text-slate-700 hover:bg-slate-300`; // Vybrať súbory
const btnDestructive = `${btnBase} bg-red-100 text-red-700 hover:bg-red-200`; // Smazat
// ===================================

export class AiGeneratorPanel extends LitElement {
    static properties = {
        lesson: { type: Object },
        viewTitle: { type: String },
        contentType: { type: String },
        fieldToUpdate: { type: String },
        promptPlaceholder: { type: String },
        description: { type: String },
        _currentLesson: { state: true, type: Object },
        _generationOutput: { state: true },
        _isLoading: { state: true, type: Boolean },
        _isSaving: { state: true, type: Boolean }, // Pridané pre ukladanie
    };

    constructor() {
        super();
        this.lesson = null;
        this.viewTitle = "AI Generátor";
        this.promptPlaceholder = "Zadejte prompt...";
        this.description = "Popis chybí.";
        this._generationOutput = null;
        this._isLoading = false;
        this._isSaving = false; // Inicializácia

        if (!generateContentCallable) {
            if (!firebaseInit.functions) {
                console.error("Firebase Functions not initialized...");
                throw new Error("Firebase Functions not initialized.");
            }
            generateContentCallable = httpsCallable(firebaseInit.functions, 'generateContent');
        }
    }

    createRenderRoot() { return this; }

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson')) {
            this._currentLesson = this.lesson ? { ...this.lesson } : null;
            this._generationOutput = null;
        }
    }

    _createDocumentSelectorUI() {
        return html`
            <div class="mb-4">
                <label class="block font-medium text-slate-600 mb-2">Vyberte kontextové dokumenty (RAG):</label>
                <div class="space-y-2 border rounded-lg p-3 bg-slate-50">
                    <ul id="selected-files-list-rag" class="text-xs text-slate-600 mb-2 list-disc list-inside">
                        <li>Žádné soubory nevybrány.</li>
                    </ul>
                    <button @click=${this._openRagModal} class="text-sm ${btnSecondary} px-2 py-1"> Vybrat soubory z knihovny
                    </button>
                </div>
                <p class="text-xs text-slate-400 mt-1">Vybrané dokumenty budou použity jako dodatečný kontext pro AI.</p>
            </div>`;
    }

    firstUpdated() {
        renderSelectedFiles();
    }

    _openRagModal(e) {
        e.preventDefault();
        const modal = document.getElementById('media-library-modal');
        const modalConfirm = document.getElementById('modal-confirm-btn');
        const modalCancel = document.getElementById('modal-cancel-btn');
        const modalClose = document.getElementById('modal-close-btn');

        if (!modal || !modalConfirm || !modalCancel || !modalClose) {
            console.error("Chybějící elementy pro modální okno.");
            showToast("Chyba: Nepodařilo se načíst komponentu pro výběr souborů.", true);
            return;
        }

        const handleConfirm = () => { renderSelectedFiles(); closeModal(); };
        const handleCancel = () => closeModal();
        const closeModal = () => {
           modal.classList.add('hidden');
           modalConfirm.removeEventListener('click', handleConfirm);
           modalCancel.removeEventListener('click', handleCancel);
           modalClose.removeEventListener('click', handleCancel);
        };

        renderMediaLibraryFiles("main-course", "modal-media-list");
        modalConfirm.addEventListener('click', handleConfirm);
        modalCancel.addEventListener('click', handleCancel);
        modalClose.addEventListener('click', handleCancel);
        modal.classList.remove('hidden');
    }

    async _handleGeneration(e) {
        e.preventDefault();
        const promptInput = this.querySelector('#prompt-input');
        const userPrompt = promptInput ? promptInput.value.trim() : '';

        if (promptInput && !userPrompt && this.contentType !== 'presentation') {
            const topicInput = this.querySelector('#prompt-input-topic');
            if (!topicInput || !topicInput.value.trim()) {
                 showToast("Prosím, zadejte text do promptu nebo téma.", true); return;
            }
        }

        this._isLoading = true; this._generationOutput = null;

        try {
            const selectedFiles = getSelectedFiles(); const filePaths = selectedFiles.map(f => f.fullPath);
            const promptData = { userPrompt: userPrompt || '' };
            const slotContent = this.querySelector('slot[name="ai-inputs"]');
            if (slotContent) {
                const nodes = slotContent.assignedNodes({flatten: true}).filter(n => n.nodeType === Node.ELEMENT_NODE);
                nodes.forEach(node => {
                    const inputs = node.querySelectorAll('input, select');
                    inputs.forEach(input => {
                        if (input.id) {
                            const key = input.id.replace(/-/g, '_').replace('_input', '');
                            promptData[key] = input.value;
                        }
                    });
                     if (nodes.length === 1 && node.id) {
                         const key = node.id.replace(/-/g, '_').replace('_input', '');
                         promptData[key] = node.value;
                     }
                });
            }
            if (this.contentType === 'presentation') {
                const topicInput = this.querySelector('#prompt-input-topic');
                if (topicInput) promptData.userPrompt = topicInput.value.trim();
            }
            if (this.contentType === 'post' && !userPrompt) promptData.userPrompt = this.promptPlaceholder;

            const result = await generateContentCallable({ contentType: this.contentType, promptData, filePaths });
            if (!result || !result.data) throw new Error("AI nevrátila žádná data.");
            if (result.data.error) throw new Error(result.data.error);
            this._generationOutput = (this.contentType === 'text' && result.data.text) ? result.data.text : result.data;
        } catch (err) {
            console.error("Error during AI generation:", err);
            showToast(`Došlo k chybě: ${err.message || err}`, true);
            this._generationOutput = { error: `Došlo k chybě: ${err.message || err}` };
        } finally { this._isLoading = false; }
    }

    _renderGeneratedContent(viewId, data) {
        // ... (kód zostáva rovnaký ako predtým) ...
        if (!data) return html`<p>Žádná data k zobrazení.</p>`;
        if (data.error) return html`<div class="p-4 bg-red-100 text-red-700 rounded-lg">${data.error}</div>`;
        try {
            switch(viewId) {
                case 'text':
                    const textContent = (typeof data === 'string') ? data : data.text;
                    if (typeof textContent !== 'string') throw new Error("Data neobsahují platný text.");
                    return html`<pre class="whitespace-pre-wrap font-sans text-sm">${textContent}</pre>`;
                case 'presentation':
                     const slides = data?.slides || [];
                     const styleId = data?.styleId || this.querySelector('#presentation-style-selector')?.value || 'default';
                     if (!Array.isArray(slides)) throw new Error("Data neobsahují platné pole 'slides'.");
                     return slides.map((slide, i) => html`
                        <div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm bg-slate-50 relative">
                            <h4 class="font-bold text-green-700">Slide ${i + 1}: ${slide.title || 'Bez názvu'}</h4>
                            <ul class="list-disc list-inside mt-2 text-sm text-slate-600">
                                ${(Array.isArray(slide.points) ? slide.points : []).map(p => html`<li>${p}</li>`)}
                            </ul>
                             <span class="style-indicator text-xs font-mono text-gray-400 absolute top-1 right-2">${styleId}</span>
                        </div>`);
                case 'quiz': case 'test':
                     if (!Array.isArray(data?.questions)) throw new Error("Data neobsahují platné pole 'questions'.");
                     return data.questions.map((q, i) => {
                        const optionsHtml = (q.options || []).map((opt, j) => html`<div class="text-sm p-2 rounded-lg ${j === q.correct_option_index ? 'bg-green-100 font-semibold' : 'bg-slate-50'}">${opt}</div>`);
                        return html`<div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm">
                                    <h4 class="font-bold text-green-700">Otázka ${i+1}: ${q.question_text || 'Chybějící text'}</h4>
                                    <div class="mt-2 space-y-2">${optionsHtml}</div>
                                </div>`; });
                case 'post':
                    if (!Array.isArray(data?.episodes)) throw new Error("Data neobsahují platné pole 'episodes'.");
                     return data.episodes.map((episode, i) => html`
                        <div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm">
                            <h4 class="font-bold text-green-700">Epizoda ${i+1}: ${episode.title || 'Bez názvu'}</h4>
                            <pre class="mt-2 text-sm text-slate-600 whitespace-pre-wrap font-sans">${episode.script || ''}</pre>
                        </div>`);
                default: return html`<div class="p-4 bg-yellow-100 text-yellow-700 rounded-lg">Neznámý typ obsahu '${viewId}' pro zobrazení.</div>`;
            }
        } catch(e) { console.error("Error rendering content:", e, data); return html`<div class="p-4 bg-red-100 text-red-700 rounded-lg">Došlo k chybě při zobrazování obsahu: ${e.message}</div>`; }
    }

    async _handleSaveGeneratedContent() {
        if (!this._currentLesson?.id) { showToast("Nejprve uložte detaily lekce.", true); return; }
        if (!this._generationOutput || this._generationOutput.error) { showToast("Není co uložit.", true); return; }

        const lessonRef = doc(firebaseInit.db, 'lessons', this._currentLesson.id);
        this._isSaving = true; // Nastavíme stav ukladania

        try {
            let dataToSave = (this.contentType === 'presentation')
                ? { styleId: this.querySelector('#presentation-style-selector')?.value || 'default', slides: this._generationOutput.slides }
                : this._generationOutput;

            await updateDoc(lessonRef, { [this.fieldToUpdate]: dataToSave, updatedAt: serverTimestamp() });
            this._currentLesson = { ...this._currentLesson, [this.fieldToUpdate]: dataToSave };
            this._generationOutput = null;
            showToast("Obsah byl úspěšně uložen do lekce.");
            this.dispatchEvent(new CustomEvent('lesson-updated', { detail: this._currentLesson, bubbles: true, composed: true }));
        } catch (error) {
            console.error(`Chyba při ukládání obsahu (${this.fieldToUpdate}):`, error);
            showToast("Při ukládání obsahu došlo k chybě.", true);
        } finally { this._isSaving = false; } // Resetujeme stav ukladania
    }

    async _handleDeleteGeneratedContent() {
        if (!this._currentLesson?.id) { showToast("Lekce není uložena.", true); return; }
        if (!confirm(`Opravdu si přejete smazat tento obsah a aktivovat generátor?`)) return;

        this._isLoading = true; // Použijeme isLoading aj pre mazanie
        try {
            const lessonRef = doc(firebaseInit.db, 'lessons', this._currentLesson.id);
            await updateDoc(lessonRef, { [this.fieldToUpdate]: deleteField(), updatedAt: serverTimestamp() });
            const updatedLesson = { ...this._currentLesson }; delete updatedLesson[this.fieldToUpdate];
            this._currentLesson = updatedLesson;
            showToast("Obsah byl úspěšně smazán.");
            this.dispatchEvent(new CustomEvent('lesson-updated', { detail: this._currentLesson, bubbles: true, composed: true }));
        } catch (error) {
            console.error("Chyba při mazání obsahu:", error);
            showToast("Při mazání obsahu došlo k chybě.", true);
        } finally { this._isLoading = false; }
    }

    render() {
        const hasSavedContent = this._currentLesson && this._currentLesson[this.fieldToUpdate];

        const title = html`
            <div class="flex justify-between items-start mb-6">
                <h2 class="text-3xl font-extrabold text-slate-800">${this.viewTitle}</h2>
                ${hasSavedContent ? html`
                    <button @click=${this._handleDeleteGeneratedContent} ?disabled=${this._isLoading || this._isSaving}
                            class="${btnDestructive} px-4 py-2 text-sm"> ${this._isLoading ? 'Mazání...' : '🗑️ Smazat a vytvořit nový'}
                    </button>
                ` : nothing}
            </div>`;

        if (hasSavedContent) {
            return html`${title}<div class="bg-white p-6 rounded-2xl shadow-lg">${this._renderGeneratedContent(this.contentType, this._currentLesson[this.fieldToUpdate])}</div>`;
        }

        return html`
            ${title}
            <div class="bg-white p-6 rounded-2xl shadow-lg">
                <p class="text-slate-500 mb-4">${this.description}</p>
                ${this._createDocumentSelectorUI()}
                <slot name="ai-inputs"></slot>
                ${this.contentType === 'presentation' ?
                    html`<label class="block font-medium text-slate-600">Téma prezentace</label><input id="prompt-input-topic" type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1 mb-4" placeholder=${this.promptPlaceholder}>` :
                    html`<textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder=${this.promptPlaceholder}></textarea>`
                }
                <div class="flex items-center justify-end mt-4">
                    <button @click=${this._handleGeneration} ?disabled=${this._isLoading || this._isSaving} class="${btnGenerate}"> ${this._isLoading ? html`<div class="spinner"></div><span class="ml-2">Generuji...</span>` : html`✨<span class="ml-2">Generovat</span>`}
                    </button>
                </div>
                <div id="generation-output" class="mt-6 border-t pt-6 text-slate-700 prose max-w-none">
                     ${this._isLoading ? html`<div class="p-8 text-center pulse-loader text-slate-500">🤖 AI Sensei přemýšlí a tvoří obsah...</div>` : ''}
                     ${this._generationOutput ? this._renderGeneratedContent(this.contentType, this._generationOutput) : (!this._isLoading ? html`<div class="text-center p-8 text-slate-400">Obsah se vygeneruje zde...</div>` : '')}
                </div>
                ${(this._generationOutput && !this._generationOutput.error) ? html`
                    <div class="text-right mt-4">
                        <button @click=${this._handleSaveGeneratedContent} ?disabled=${this._isLoading || this._isSaving} class="${btnPrimary}"> ${this._isSaving ? html`<div class="spinner"></div><span class="ml-2">Ukládám...</span>` : 'Uložit do lekce'}
                        </button>
                    </div>
                ` : nothing}
            </div>
        `;
    }
}
customElements.define('ai-generator-panel', AiGeneratorPanel);
