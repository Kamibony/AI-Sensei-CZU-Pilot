// public/js/views/professor/editor/ai-generator-panel.js
import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, updateDoc, deleteField, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../../firebase-init.js';
import { showToast } from '../../../utils.js';
import { renderSelectedFiles, getSelectedFiles, renderMediaLibraryFiles, loadSelectedFiles } from '../../../upload-handler.js';
import { callGenerateContent } from '../../../gemini-api.js';

// Štýly tlačidiel
const btnBase = "px-5 py-2 font-semibold rounded-lg transition transform hover:scale-105 disabled:opacity-50 disabled:scale-100 flex items-center justify-center";
const btnPrimary = `${btnBase} bg-green-700 text-white hover:bg-green-800`;
const btnGenerate = `${btnBase} bg-amber-600 text-white hover:bg-amber-700 ai-glow`;
const btnSecondary = `${btnBase} bg-slate-200 text-slate-700 hover:bg-slate-300`;
const btnDestructive = `${btnBase} bg-red-100 text-red-700 hover:bg-red-200`;

export class AiGeneratorPanel extends LitElement {
    static properties = {
        lesson: { type: Object },
        viewTitle: { type: String },
        contentType: { type: String },
        fieldToUpdate: { type: String },
        promptPlaceholder: { type: String },
        description: { type: String },
        _generationOutput: { state: true },
        _isLoading: { state: true, type: Boolean },
        _isSaving: { state: true, type: Boolean },
    };

    constructor() {
        super();
        this.lesson = null; this.viewTitle = "AI Generátor"; this.promptPlaceholder = "Zadejte prompt...";
        this.description = "Popis chybí."; this._generationOutput = null;
        this._isLoading = false; this._isSaving = false;
    }

    createRenderRoot() { return this; }

    _createDocumentSelectorUI() {
        const listId = `selected-files-list-rag-${this.contentType}`;
        return html`
            <div class="mb-4">
                <label class="block font-medium text-slate-600 mb-2">Vyberte kontextové dokumenty (RAG):</label>
                <div class="space-y-2 border rounded-lg p-3 bg-slate-50">
                    <ul id="${listId}" class="text-xs text-slate-600 mb-2 list-disc list-inside">
                        <li>Žádné soubory nevybrány.</li>
                    </ul>
                    <button @click=${this._openRagModal} class="text-sm ${btnSecondary} px-2 py-1">
                        Vybrat soubory z knihovny
                    </button>
                </div>
                <p class="text-xs text-slate-400 mt-1">Vybrané dokumenty budou použity jako dodatečný kontext pro AI.</p>
            </div>`;
     }

    updated(changedProperties) {
        if (this.lesson && (changedProperties.has('lesson') || !changedProperties.has('lesson')) ) {
            setTimeout(() => {
                 loadSelectedFiles(this.lesson?.ragFilePaths || []);
                 renderSelectedFiles(`selected-files-list-rag-${this.contentType}`);
            }, 0);
        }
    }

    _openRagModal(e) {
        e.preventDefault();
        const modal = document.getElementById('media-library-modal');
        const modalConfirm = document.getElementById('modal-confirm-btn');
        const modalCancel = document.getElementById('modal-cancel-btn');
        const modalClose = document.getElementById('modal-close-btn');
        if (!modal || !modalConfirm || !modalCancel || !modalClose) { console.error("Chybějící elementy pro modální okno."); showToast("Chyba: Nepodařilo se načíst komponentu pro výběr souborů.", true); return; }
        
        loadSelectedFiles(this.lesson?.ragFilePaths || []);
        
        const handleConfirm = () => {
             renderSelectedFiles(`selected-files-list-rag-${this.contentType}`);
             closeModal();
        };
        const handleCancel = () => closeModal();
        const closeModal = () => { modal.classList.add('hidden'); modalConfirm.removeEventListener('click', handleConfirm); modalCancel.removeEventListener('click', handleCancel); modalClose.removeEventListener('click', handleCancel); };
        
        renderMediaLibraryFiles("main-course", "modal-media-list");
        modalConfirm.addEventListener('click', handleConfirm); modalCancel.addEventListener('click', handleCancel); modalClose.addEventListener('click', handleCancel);
        modal.classList.remove('hidden');
     }

    async _handleGeneration(e) {
        e.preventDefault();
        const promptInput = this.querySelector('#prompt-input');
        const userPrompt = promptInput ? promptInput.value.trim() : '';

        // Základná validácia témy (okrem prezentácie, tá má vlastný input)
        if (promptInput && !userPrompt && this.contentType !== 'presentation') {
             const topicInput = this.querySelector('#prompt-input-topic');
             if (!topicInput || !topicInput.value.trim()) {
                 showToast("Prosím, zadejte text do promptu nebo téma.", true);
                 return;
             }
        }

        this._isLoading = true;
        this._generationOutput = null;

        try {
            const selectedFiles = getSelectedFiles();
            const filePaths = selectedFiles.map(f => f.fullPath);
            const promptData = { userPrompt: userPrompt || '' };

            // === OPRAVENÉ A ZJEDNODUŠENÉ ČÍTANIE VSTUPOV ===
            const slot = this.querySelector('slot[name="ai-inputs"]');
            if (slot) {
                // assignedElements vráti iba Element nodes (žiadne textové uzly, čo spôsobovali pád)
                const elements = slot.assignedElements({flatten: true});
                elements.forEach(el => {
                    // 1. Skúsime nájsť inputy VNÚTRI elementu (ak je to napr. div wrapper)
                    const nestedInputs = el.querySelectorAll('input, select, textarea');
                    nestedInputs.forEach(input => {
                        if (input.id) promptData[input.id.replace(/-/g, '_').replace('_input', '')] = input.value;
                    });

                    // 2. Skontrolujeme, či samotný element nie je input
                    if ((el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') && el.id) {
                         promptData[el.id.replace(/-/g, '_').replace('_input', '')] = el.value;
                    }
                });
            }
            // === KONIEC OPRAVY ČÍTANIA VSTUPOV ===

            if (this.contentType === 'presentation') {
                 const topicInput = this.querySelector('#prompt-input-topic');
                 if (topicInput) promptData.userPrompt = topicInput.value.trim();
            }
            if (this.contentType === 'post' && !userPrompt) promptData.userPrompt = this.promptPlaceholder;

            // === VALIDÁCIA POČTU SLIDOV (zostáva zachovaná) ===
            if (this.contentType === 'presentation') {
                // Pre istotu logujeme, čo sme načítali
                console.log("Frontend validation - slide_count raw value:", promptData.slide_count);
                
                const count = parseInt(promptData.slide_count, 10);
                if (!count || count <= 0) {
                    showToast(`Neplatný počet slidů. Zadejte prosím kladné číslo.`, true);
                    this._isLoading = false;
                    return;
                }
            }

            const result = await callGenerateContent({ contentType: this.contentType, promptData, filePaths });
            
            if (!result) throw new Error("AI nevrátila žádná data."); 
            if (result.error) throw new Error(result.error);
            
            this._generationOutput = (this.contentType === 'text' && result.text) ? result.text : result;
        } catch (err) {
            console.error("Error during AI generation:", err);
            showToast(`Došlo k chybě: ${err.message || err}`, true);
            this._generationOutput = { error: `Došlo k chybě: ${err.message || err}` };
        } finally {
            this._isLoading = false;
        }
     }

    _renderEditableContent(contentType, contentData) {
        switch (contentType) {
            case 'text':
                return html`<textarea id="editable-content-textarea-${this.contentType}" class="w-full border-slate-300 rounded-lg p-3 h-64 focus:ring-green-500 focus:border-green-500 font-sans text-sm" .value=${contentData || ''}></textarea>`;
            case 'quiz': case 'test': case 'presentation': case 'post':
                 return html`${this._renderStaticContent(contentType, contentData)}`;
            default: return html`<p>Neznámý typ obsahu pro úpravu.</p>`;
        }
    }

    _renderStaticContent(viewId, data) {
        if (!data) return html`<p>Žádná data k zobrazení.</p>`;
        if (data.error) return html`<div class="p-4 bg-red-100 text-red-700 rounded-lg">${data.error}</div>`;
        try {
            switch(viewId) {
                case 'text':
                    return html`<div class="whitespace-pre-wrap font-sans text-sm">${(typeof data === 'string') ? data : (data.text || '')}</div>`;
                case 'presentation':
                     return (data?.slides || []).map((slide, i) => html`
                        <div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm bg-slate-50 relative">
                            <h4 class="font-bold text-green-700">Slide ${i + 1}: ${slide.title || 'Bez názvu'}</h4>
                            <ul class="list-disc list-inside mt-2 text-sm text-slate-600">
                                ${(slide.points || []).map(p => html`<li>${p}</li>`)}
                            </ul>
                             <span class="style-indicator text-xs font-mono text-gray-400 absolute top-1 right-2">${data?.styleId || 'default'}</span>
                        </div>`);
                case 'quiz': case 'test':
                     return (data?.questions || []).map((q, i) => html`
                        <div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm">
                            <h4 class="font-bold text-green-700">Otázka ${i+1}: ${q.question_text || 'Chybějící text'}</h4>
                            <div class="mt-2 space-y-2">
                                ${(q.options || []).map((opt, j) => html`<div class="text-sm p-2 rounded-lg ${j === q.correct_option_index ? 'bg-green-100 font-semibold' : 'bg-slate-50'}">${opt}</div>`)}
                            </div>
                        </div>`);
                case 'post':
                     return (data?.episodes || []).map((episode, i) => html`
                        <div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm">
                            <h4 class="font-bold text-green-700">Epizoda ${i+1}: ${episode.title || 'Bez názvu'}</h4>
                            <pre class="mt-2 text-sm text-slate-600 whitespace-pre-wrap font-sans">${episode.script || ''}</pre>
                        </div>`);
                default: return html`<div class="p-4 bg-yellow-100 text-yellow-700 rounded-lg">Neznámý typ obsahu '${viewId}' pro zobrazení.</div>`;
            }
        } catch(e) { return html`<div class="p-4 bg-red-100 text-red-700 rounded-lg">Došlo k chybě při zobrazování obsahu: ${e.message}</div>`; }
     }

    async _handleSaveGeneratedContent() {
        if (!this.lesson?.id) { showToast("Nejprve uložte detaily lekce.", true); return; }
        const hasExistingContent = this.lesson[this.fieldToUpdate];
        let dataToSave;

        if (hasExistingContent && this.contentType === 'text') {
            const textarea = this.querySelector(`#editable-content-textarea-${this.contentType}`);
            if (!textarea) { showToast("Chyba: Editační pole nebylo nalezeno.", true); return; }
            dataToSave = textarea.value;
        } else if (hasExistingContent) {
             showToast("Ukládání úprav pro tento typ obsahu zatím není podporováno.", true); return;
        } else if (this._generationOutput && !this._generationOutput.error) {
             if (this.contentType === 'presentation') { dataToSave = { styleId: this.querySelector('#presentation-style-selector')?.value || 'default', slides: this._generationOutput.slides }; }
             else { dataToSave = this._generationOutput; }
        } else { showToast("Není co uložit.", true); return; }

        this._isSaving = true;
        try {
            const lessonRef = doc(firebaseInit.db, 'lessons', this.lesson.id);
            await updateDoc(lessonRef, { [this.fieldToUpdate]: dataToSave, updatedAt: serverTimestamp() });
            this.dispatchEvent(new CustomEvent('lesson-updated', { detail: { ...this.lesson, [this.fieldToUpdate]: dataToSave }, bubbles: true, composed: true }));
            showToast(hasExistingContent ? "Změny byly úspěšně uloženy." : "Obsah byl úspěšně uložen do lekce.");
            this._generationOutput = null;
        } catch (error) { console.error(`Chyba při ukládání:`, error); showToast("Při ukládání obsahu došlo k chybě.", true); }
        finally { this._isSaving = false; }
    }

    async _handleDeleteGeneratedContent() {
        if (!this.lesson?.id || !confirm(`Opravdu si přejete smazat tento obsah?`)) return;
        this._isLoading = true;
        try {
            await updateDoc(doc(firebaseInit.db, 'lessons', this.lesson.id), { [this.fieldToUpdate]: deleteField(), updatedAt: serverTimestamp() });
            const updatedLesson = { ...this.lesson }; delete updatedLesson[this.fieldToUpdate];
            this.dispatchEvent(new CustomEvent('lesson-updated', { detail: updatedLesson, bubbles: true, composed: true }));
            showToast("Obsah byl úspěšně smazán.");
        } catch (error) { console.error("Chyba při mazání:", error); showToast("Při mazání obsahu došlo k chybě.", true); }
        finally { this._isLoading = false; }
     }

    render() {
        const hasSavedContent = this.lesson && this.lesson[this.fieldToUpdate];
        const isEditable = this.contentType === 'text';

        return html`
            <div class="flex justify-between items-start mb-6">
                <h2 class="text-3xl font-extrabold text-slate-800">${this.viewTitle}</h2>
                ${hasSavedContent ? html`<button @click=${this._handleDeleteGeneratedContent} ?disabled=${this._isLoading || this._isSaving} class="${btnDestructive} px-4 py-2 text-sm">${this._isLoading ? 'Mazání...' : '🗑️ Smazat'} ${!isEditable ? 'a vytvořit nový' : ''}</button>` : nothing}
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-lg">
                ${hasSavedContent ? html`
                    ${isEditable ? this._renderEditableContent(this.contentType, this.lesson[this.fieldToUpdate]) : this._renderStaticContent(this.contentType, this.lesson[this.fieldToUpdate])}
                    ${isEditable ? html`<div class="text-right mt-4"><button @click=${this._handleSaveGeneratedContent} ?disabled=${this._isLoading || this._isSaving} class="${btnPrimary}">${this._isSaving ? html`<div class="spinner"></div><span class="ml-2">Ukládám...</span>` : 'Uložit změny'}</button></div>` : nothing}
                ` : html`
                    <p class="text-slate-500 mb-4">${this.description}</p>
                    ${this._createDocumentSelectorUI()}
                    <slot name="ai-inputs"></slot>
                    ${this.contentType === 'presentation' ? html`<label class="block font-medium text-slate-600">Téma prezentace</label><input id="prompt-input-topic" type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1 mb-4" placeholder=${this.promptPlaceholder}>` : html`<textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder=${this.promptPlaceholder}></textarea>`}
                    <div class="flex items-center justify-end mt-4"><button @click=${this._handleGeneration} ?disabled=${this._isLoading || this._isSaving} class="${btnGenerate}">${this._isLoading ? html`<div class="spinner"></div><span class="ml-2">Generuji...</span>` : html`✨<span class="ml-2">Generovat</span>`}</button></div>
                    <div id="generation-output" class="mt-6 border-t pt-6 text-slate-700 prose max-w-none">
                         ${this._isLoading ? html`<div class="p-8 text-center pulse-loader text-slate-500">🤖 AI Sensei přemýšlí...</div>` : ''}
                         ${this._generationOutput ? this._renderStaticContent(this.contentType, this._generationOutput) : (!this._isLoading ? html`<div class="text-center p-8 text-slate-400">Obsah se vygeneruje zde...</div>` : '')}
                    </div>
                    ${(this._generationOutput && !this._generationOutput.error) ? html`<div class="text-right mt-4"><button @click=${this._handleSaveGeneratedContent} ?disabled=${this._isLoading || this._isSaving} class="${btnPrimary}">${this._isSaving ? html`<div class="spinner"></div><span class="ml-2">Ukládám...</span>` : 'Uložit do lekce'}</button></div>` : nothing}
                `}
            </div>
        `;
    }
}
customElements.define('ai-generator-panel', AiGeneratorPanel);
