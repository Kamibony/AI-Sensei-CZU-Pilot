import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, updateDoc, deleteField, serverTimestamp, addDoc, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../../firebase-init.js';
import { showToast } from '../../../utils.js';
import { renderSelectedFiles, getSelectedFiles, renderMediaLibraryFiles, loadSelectedFiles, processAndStoreFile, addSelectedFile } from '../../../upload-handler.js';
import { callGenerateContent } from '../../../gemini-api.js';
import { translationService } from '../../../utils/translation-service.js';

const btnBase = "px-5 py-2 font-semibold rounded-lg transition transform hover:scale-105 disabled:opacity-50 disabled:scale-100 flex items-center justify-center";
const btnPrimary = `${btnBase} bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-indigo-200 w-full`;
const btnGenerate = `px-6 py-3 rounded-full font-bold bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all flex items-center ai-glow border border-white/20`;
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
        inputsConfig: { type: Array },
        _generationOutput: { state: true },
        _isLoading: { state: true, type: Boolean },
        _isSaving: { state: true, type: Boolean },
        _isUploading: { state: true, type: Boolean },
        _uploadProgress: { state: true, type: Number },
        _uploadStatusMsg: { state: true, type: String },
        _uploadStatusType: { state: true, type: String },
        _showBanner: { state: true, type: Boolean },
        _filesCount: { state: true, type: Number },
        onSave: { type: Function }
    };

    constructor() {
        super();
        this.lesson = null; 
        this.viewTitle = "AI Generátor"; 
        this.promptPlaceholder = "Zadejte prompt...";
        this.description = "Popis chybí."; 
        this.inputsConfig = []; 
        this._generationOutput = null;
        this._isLoading = false; 
        this._isSaving = false;
        this._isUploading = false; 
        this._uploadProgress = 0; 
        this._uploadStatusMsg = ''; 
        this._uploadStatusType = '';
        this._showBanner = true;
        this._filesCount = 0;
    }

    createRenderRoot() { return this; }

    // === OPRAVENÁ METÓDA PRE SYNCHRONIZÁCIU SÚBOROV ===
    updated(changedProperties) {
        // Kontrolujeme, či sa zmenila lekcia, alebo či sme sa práve vykreslili
        if (this.lesson || changedProperties.has('lesson')) {
            
            // 1. Zistíme, čo máme v globálnej pamäti (z Kroku 1)
            const filesInGlobalMemory = getSelectedFiles();
            
            // 2. Zistíme, čo je uložené v objekte lekcie (z databázy)
            const filesInLesson = this.lesson?.ragFilePaths || [];

            // === KRITICKÁ OPRAVA LOGIKY ===
            // Ak je toto NOVÁ lekcia (v databáze nemá súbory), ale v pamäti (z Kroku 1) niečo je,
            // tak dáme prednosť pamäti a NEPREPÍŠEME ju prázdnym poľom.
            
            if (filesInLesson.length === 0 && filesInGlobalMemory.length > 0) {
                // Sme v režime tvorby novej lekcie -> Dôverujeme globálnej pamäti
                this._filesCount = filesInGlobalMemory.length;
                
                // Len prekreslíme zoznam v UI, aby bol viditeľný
                setTimeout(() => {
                    renderSelectedFiles(`selected-files-list-rag-${this.contentType}`);
                }, 0);

            } else {
                // Sme v režime editácie existujúcej lekcie (alebo je pamäť prázdna) -> Dôverujeme lekcii
                // Táto vetva sa spustí len ak má lekcia uložené súbory, alebo ak nemáme v pamäti nič.
                
                // Optimalizácia: Nerobíme to, ak sa nič nezmenilo
                const shouldReload = JSON.stringify(filesInGlobalMemory.map(f=>f.fullPath)) !== JSON.stringify(filesInLesson);
                
                if (shouldReload || filesInGlobalMemory.length === 0) {
                     this._filesCount = filesInLesson.length;
                     setTimeout(() => {
                        loadSelectedFiles(filesInLesson);
                        renderSelectedFiles(`selected-files-list-rag-${this.contentType}`);
                     }, 0);
                } else {
                    // Update counter even if no reload needed
                    this._filesCount = filesInGlobalMemory.length;
                }
            }
        }
    }

    _handleInlineUpload(e) {
        console.warn("Inline upload is disabled here. Use Lesson Settings.");
    }

    _setUploadStatus(msg, type) {
        this._uploadStatusMsg = msg;
        this._uploadStatusType = type;
        this.requestUpdate();
    }

    _createDocumentSelectorUI() {
        const listId = `selected-files-list-rag-${this.contentType}`;
        const hasFiles = this._filesCount > 0;

        return html`
            <div class="mb-6 p-4 rounded-xl border ${hasFiles ? 'bg-slate-50 border-slate-200' : 'bg-orange-50 border-orange-200'}">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-semibold ${hasFiles ? 'text-slate-700' : 'text-orange-800'}">
                        ${hasFiles ? '📚 Kontext pro AI (RAG)' : '⚠️ Žádné soubory pro kontext'}
                    </h3>
                    <span class="text-xs ${hasFiles ? 'text-slate-500' : 'text-orange-600'} bg-white px-2 py-1 rounded border ${hasFiles ? 'border-slate-200' : 'border-orange-200'}">
                        ${this._filesCount} souborů
                    </span>
                </div>
                
                <div class="mb-1">
                     <ul id="${listId}" class="text-sm text-slate-600 bg-white p-3 rounded-lg border border-slate-200 min-h-[50px]">
                        <li>${translationService.t('common.no_files_selected')}</li>
                    </ul>
                </div>

                ${!hasFiles ? html`
                    <p class="text-xs text-orange-700 mt-2 font-bold">
                        ⚠️ Pozor: Bez nahraných souborů může AI halucinovat (vymýšlet si fakta).
                    </p>
                ` : nothing}
                
                <p class="text-xs text-slate-400 mt-2">
                    ℹ️ Soubory spravujete v kroku 1 "Základy".
                </p>
            </div>`;
     }

    _openRagModal(e) {
        e.preventDefault();
        const modal = document.getElementById('media-library-modal');
        if (!modal) return;
        
        // Pri otvorení modálu rešpektujeme aktuálny stav
        // (netreba volať loadSelectedFiles, lebo už sú v pamäti)
        renderMediaLibraryFiles("main-course", "modal-media-list");
        modal.classList.remove('hidden');
        
        const close = () => { modal.classList.add('hidden'); cleanup(); };
        const confirm = () => { 
            // Po potvrdení aktualizujeme UI
            this._filesCount = getSelectedFiles().length;
            renderSelectedFiles(`selected-files-list-rag-${this.contentType}`); 
            close(); 
        };
        const cleanup = () => {
             document.getElementById('modal-confirm-btn')?.removeEventListener('click', confirm);
             document.getElementById('modal-cancel-btn')?.removeEventListener('click', close);
             document.getElementById('modal-close-btn')?.removeEventListener('click', close);
        }
        document.getElementById('modal-confirm-btn')?.addEventListener('click', confirm);
        document.getElementById('modal-cancel-btn')?.addEventListener('click', close);
        document.getElementById('modal-close-btn')?.addEventListener('click', close);
     }

    _renderDynamicInputs() {
        if (!this.inputsConfig || this.inputsConfig.length === 0) {
            return html`<slot name="ai-inputs"></slot>`;
        }

        return html`
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                ${this.inputsConfig.map(input => html`
                    <div class="${input.fullWidth ? 'col-span-full' : ''}">
                        <label class="block font-medium text-slate-600 text-sm mb-1" for="${input.id}">
                            ${input.label}
                        </label>
                        ${input.type === 'select' 
                            ? html`
                                <select 
                                    id="${input.id}" 
                                    class="w-full border-slate-300 rounded-lg p-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                >
                                    ${input.options.map(opt => html`
                                        <option value="${opt}" ?selected="${opt === input.default}">${opt}</option>
                                    `)}
                                </select>`
                            : html`
                                <input 
                                    id="${input.id}" 
                                    type="${input.type}" 
                                    class="w-full border-slate-300 rounded-lg p-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                    value="${input.default || ''}"
                                    min="${input.min || ''}"
                                    max="${input.max || ''}"
                                >`
                        }
                    </div>
                `)}
            </div>
        `;
    }

    async _handleGeneration(e) {
        e.preventDefault();
        
        // 1. Získanie aktuálne vybraných súborov (TERAZ UŽ SPRÁVNE Z PAMÄTE)
        const selectedFiles = getSelectedFiles();
        const filePaths = selectedFiles.map(f => f.fullPath);

        // 2. Kontrola
        if (filePaths.length === 0) {
            const confirmed = confirm(
                "⚠️ UPOZORNĚNÍ: Nemáte vybrané žádné soubory pro kontext (RAG).\n\n" +
                "AI bude generovat obsah pouze na základě vašeho promptu.\n\n" +
                "Chcete přesto pokračovat bez souborů?"
            );
            if (!confirmed) return; 
        }

        const promptInput = this.querySelector('#prompt-input');
        const topicInput = this.querySelector('#prompt-input-topic');
        
        let userPrompt = '';
        if (this.contentType === 'presentation' && topicInput) {
             userPrompt = topicInput.value.trim();
        } else if (promptInput) {
             userPrompt = promptInput.value.trim();
        }

        if (this.lesson && this.lesson.text_content) {
            userPrompt += `\n\nContext: ${this.lesson.text_content}. Based on this context, generate the following content.`;
        }

        if (!userPrompt && this.contentType !== 'post' && this.contentType !== 'presentation') {
            const fallbackInput = this.querySelector('#prompt-input-topic');
            if (!fallbackInput || !fallbackInput.value.trim()) {
                 alert("Prosím, zadejte text do promptu nebo téma.");
                 return;
            }
        }
        if (this.contentType === 'presentation' && !userPrompt) {
             alert("Prosím, zadejte téma prezentace.");
             return;
        }

        this._isLoading = true;
        this._generationOutput = null;

        try {
            const promptData = { userPrompt: userPrompt || this.promptPlaceholder, isMagic: true };

            if (this.inputsConfig && this.inputsConfig.length > 0) {
                this.inputsConfig.forEach(conf => {
                    const el = this.querySelector(`#${conf.id}`);
                    if (el) {
                        const key = conf.id.replace(/-/g, '_').replace('_input', ''); 
                        promptData[key] = el.value;
                    }
                });
            } else {
                const slottedElements = this.querySelectorAll('[slot="ai-inputs"]');
                slottedElements.forEach(el => {
                    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && el.id) {
                        promptData[el.id.replace(/-/g, '_').replace('_input', '')] = el.value;
                    }
                    const nestedInputs = el.querySelectorAll('input, select, textarea');
                    nestedInputs.forEach(input => {
                        if (input.id) promptData[input.id.replace(/-/g, '_').replace('_input', '')] = input.value;
                    });
                });
            }

            if (this.contentType === 'presentation') {
                const count = parseInt(promptData.slide_count, 10);
                if (!count || count <= 0) {
                    alert(`Neplatný počet slidů. Zadejte prosím kladné číslo.`);
                    this._isLoading = false;
                    return;
                }
            }

            if (this.contentType === 'post' && !userPrompt) promptData.userPrompt = this.promptPlaceholder;

            if (['test', 'quiz'].includes(this.contentType)) {
                const count = promptData.question_count || promptData.question_count_input;
                if (count) promptData.userPrompt += `\n\nInstrukce: Vytvoř přesně ${count} otázek.`;
                const diff = promptData.difficulty_select || promptData.difficulty;
                if (diff) promptData.userPrompt += `\nObtížnost: ${diff}.`;
                const type = promptData.type_select || promptData.question_types;
                if (type) promptData.userPrompt += `\nTyp otázek: ${type}.`;
            }

            // VOLANIE API - TERAZ UŽ S filePaths
            const result = await callGenerateContent({ contentType: this.contentType, promptData, filePaths });
            if (!result || result.error) throw new Error(result?.error || "AI nevrátila žádná data.");
            this._generationOutput = (this.contentType === 'text' && result.text) ? result.text : result;

        } catch (err) {
            console.error("Error during AI generation:", err);
            this._generationOutput = { error: `Došlo k chybě: ${err.message}` };
        } finally {
            this._isLoading = false;
        }
     }

    _renderStaticContent(viewId, data) {
        if (!data) return html`<p>Žádná data k zobrazení.</p>`;
        if (data.error) return html`<div class="p-4 bg-red-100 text-red-700 rounded-lg">${data.error}</div>`;
        try {
             if (viewId === 'text') return html`<div class="whitespace-pre-wrap font-sans text-sm">${(typeof data === 'string') ? data : (data.text || '')}</div>`;
             if (viewId === 'presentation') return (data?.slides || []).map((slide, i) => html`<div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm bg-slate-50 relative"><h4 class="font-bold text-green-700">Slide ${i + 1}: ${slide.title || 'Bez názvu'}</h4><ul class="list-disc list-inside mt-2 text-sm text-slate-600">${(slide.points || []).map(p => html`<li>${p}</li>`)}</ul><span class="style-indicator text-xs font-mono text-gray-400 absolute top-1 right-2">${data?.styleId || 'default'}</span></div>`);
             if (viewId === 'quiz' || viewId === 'test') return (data?.questions || []).map((q, i) => html`<div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm"><h4 class="font-bold text-green-700">Otázka ${i+1}: ${q.question_text}</h4><div class="mt-2 space-y-2">${(q.options || []).map((opt, j) => html`<div class="text-sm p-2 rounded-lg ${j === q.correct_option_index ? 'bg-green-100 font-semibold' : 'bg-slate-50'}">${opt}</div>`)}</div></div>`);
             if (viewId === 'post') {
                 // New Structured Format (Lesson + Podcast)
                 if (data?.lesson && data?.podcast_series) {
                     return html`
                        <div class="space-y-8">
                            <!-- A. Lesson Section -->
                            <div class="bg-indigo-50 p-6 rounded-xl border border-indigo-100">
                                <div class="border-b border-indigo-200 pb-4 mb-4">
                                    <h3 class="text-2xl font-bold text-indigo-900">${data.lesson.title}</h3>
                                    <p class="text-indigo-700 mt-2 italic">${data.lesson.description}</p>
                                </div>

                                <div class="space-y-4 mb-6">
                                    ${(data.lesson.modules || []).map((m, idx) => html`
                                        <div class="bg-white p-4 rounded-lg border border-indigo-100 shadow-sm">
                                            <h4 class="font-bold text-indigo-800 text-sm uppercase tracking-wide mb-2">Module ${idx + 1}: ${m.title}</h4>
                                            <p class="text-slate-700 text-sm leading-relaxed">${m.content}</p>
                                        </div>
                                    `)}
                                </div>

                                <div class="bg-indigo-100 p-4 rounded-lg border-l-4 border-indigo-500">
                                    <h4 class="font-bold text-indigo-900 text-sm uppercase tracking-wider mb-1">🔑 Key Takeaway</h4>
                                    <p class="text-indigo-800 font-medium">${data.lesson.summary}</p>
                                </div>
                            </div>

                            <!-- B. Podcast Series Section -->
                            <div>
                                <div class="flex items-center justify-between mb-4">
                                    <h3 class="text-xl font-bold text-slate-800 flex items-center">
                                        <span class="text-3xl mr-3">🎙️</span> ${data.podcast_series.title}
                                    </h3>
                                    <span class="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-500">Series of ${(data.podcast_series.episodes || []).length}</span>
                                </div>

                                <div class="space-y-6">
                                    ${(data.podcast_series.episodes || []).map((ep, i) => html`
                                        <div class="p-5 border border-slate-200 rounded-xl shadow-sm bg-white hover:shadow-md transition-shadow">
                                            <div class="flex justify-between items-start mb-4 border-b border-slate-50 pb-2">
                                                <div>
                                                    <span class="text-xs font-bold text-indigo-600 uppercase tracking-wider">Episode ${ep.episode_number || i + 1}</span>
                                                    <h4 class="font-bold text-slate-800 text-lg">${ep.title}</h4>
                                                </div>
                                                <span class="text-2xl opacity-20">🎧</span>
                                            </div>

                                            <div class="text-sm text-slate-600 font-mono bg-slate-50 p-4 rounded-lg border border-slate-100 max-h-60 overflow-y-auto custom-scrollbar">
                                                ${(ep.script || '').split('\n').map(line => {
                                                    const trimmed = line.trim();
                                                    if (!trimmed) return nothing;

                                                    if (trimmed.startsWith('[')) {
                                                        const splitIdx = trimmed.indexOf(']:');
                                                        if (splitIdx > -1) {
                                                            const speaker = trimmed.substring(1, splitIdx);
                                                            const text = trimmed.substring(splitIdx + 2);
                                                            const isHost = speaker.toLowerCase().includes('alex');
                                                            return html`<div class="mb-2"><strong class="${isHost ? 'text-blue-600' : 'text-purple-600'}">${speaker}:</strong> <span class="text-slate-700">${text}</span></div>`;
                                                        }
                                                    }
                                                    return html`<div class="mb-1">${line}</div>`;
                                                })}
                                            </div>
                                        </div>
                                    `)}
                                </div>
                            </div>
                        </div>
                     `;
                 }
                 // Legacy/Fallback Support
                 return (data?.episodes || []).map((ep, i) => html`<div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm"><h4 class="font-bold text-green-700">Epizoda ${i+1}: ${ep.title}</h4><pre class="mt-2 text-sm text-slate-600 whitespace-pre-wrap font-sans">${ep.script}</pre></div>`);
             }
             return html`<div class="p-4 bg-yellow-100">Neznámý typ obsahu.</div>`;
        } catch(e) { return html`<div class="p-4 bg-red-100 text-red-700">Chyba zobrazení: ${e.message}</div>`; }
    }

    _renderEditableContent(contentType, data) {
        return contentType === 'text' ? html`<textarea id="editable-content-textarea-text" class="w-full border-slate-300 rounded-lg p-3 h-64 font-sans text-sm" .value=${data || ''}></textarea>` : this._renderStaticContent(contentType, data);
    }

    async _handleSaveGeneratedContent() {
        this._isSaving = true;
        try {
            let dataToSave = this._generationOutput;
            if (this.contentType === 'text') {
                const textarea = this.querySelector('#editable-content-textarea-text');
                if (textarea) dataToSave = textarea.value;
            }
            if (this.contentType === 'presentation') {
                const styleSelector = this.querySelector('#presentation-style-selector');
                dataToSave = {
                    styleId: styleSelector ? styleSelector.value : 'default',
                    slides: this._generationOutput.slides
                };
            }

            // === VŽDY UKLADÁME AKTUÁLNY STAV SÚBOROV Z UI (PRETOŽE MÔŽU BYŤ ZMENENÉ) ===
            const currentRagFiles = getSelectedFiles().map(f => f.fullPath);

            if (!this.lesson || !this.lesson.id) {
                const lessonData = {
                    title: "Nová lekce (AI)",
                    status: "Naplánováno",
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    ownerId: firebaseInit.auth.currentUser.uid,
                    [this.fieldToUpdate]: dataToSave,
                    ragFilePaths: currentRagFiles
                };

                const docRef = await addDoc(collection(firebaseInit.db, 'lessons'), lessonData);
                alert("Nová lekce byla úspěšně vytvořena s AI obsahem!");

                 this.dispatchEvent(new CustomEvent('lesson-created', {
                    detail: { newLessonId: docRef.id },
                    bubbles: true,
                    composed: true
                }));

            } else {
                await updateDoc(doc(firebaseInit.db, 'lessons', this.lesson.id), {
                    [this.fieldToUpdate]: dataToSave,
                    ragFilePaths: currentRagFiles,
                    updatedAt: serverTimestamp()
                });

                this.dispatchEvent(new CustomEvent('lesson-updated', {
                    detail: {
                        ...this.lesson,
                        [this.fieldToUpdate]: dataToSave,
                        ragFilePaths: currentRagFiles
                    },
                    bubbles: true,
                    composed: true
                }));
            }

            this._generationOutput = null;
        } catch (e) {
            console.error("Firebase Error:", e);
            alert("Došlo k chybě při ukládání: " + e.message);
        } finally {
            this._isSaving = false;
        }
    }

    async _handleDeleteGeneratedContent() {
        if (!confirm("Smazat obsah?")) return;
        this._isLoading = true;
        try {
            await updateDoc(doc(firebaseInit.db, 'lessons', this.lesson.id), { [this.fieldToUpdate]: deleteField(), updatedAt: serverTimestamp() });
            const upd = { ...this.lesson }; delete upd[this.fieldToUpdate];
            this.dispatchEvent(new CustomEvent('lesson-updated', { detail: upd, bubbles: true, composed: true }));
        } catch (e) { console.error(e); alert("Chyba mazání."); } finally { this._isLoading = false; }
    }

    render() {
        const hasContent = this.lesson && this.lesson[this.fieldToUpdate];
        const isText = this.contentType === 'text';
        return html`
            ${this._showBanner ? html`
            <div class="bg-blue-50 border-l-4 border-blue-500 text-blue-700 p-4 mb-4 rounded shadow-sm relative">
                <button @click=${() => this._showBanner = false} class="absolute top-2 right-2 text-blue-400 hover:text-blue-700 text-lg font-bold">&times;</button>
                <p><strong>💡 ${translationService.t('editor.ai_tip_title')}</strong> ${translationService.t('editor.ai_tip_desc')}</p>
            </div>` : nothing}
            
            <div class="flex justify-between items-start mb-6"><h2 class="text-3xl font-extrabold text-slate-800">${this.viewTitle}</h2>${hasContent ? html`<button @click=${this._handleDeleteGeneratedContent} ?disabled=${this._isLoading||this._isSaving} class="${btnDestructive} px-4 py-2 text-sm">${this._isLoading?'...':'🗑️ Smazat'} ${!isText?'a nové':''}</button>`:nothing}</div>
            
            <div class="bg-white p-6 rounded-2xl shadow-lg">
                ${hasContent ? html`
                    ${this._renderEditableContent(this.contentType, this.lesson[this.fieldToUpdate])}

                    <div class="flex flex-wrap items-center justify-between mt-6 gap-4 border-t border-slate-100 pt-4">
                        <button @click=${this._handleDeleteGeneratedContent} ?disabled=${this._isLoading||this._isSaving} class="${btnSecondary} px-4 py-2 text-sm font-medium border border-slate-200 shadow-sm hover:border-slate-300">
                            🔄 Pregenerovať
                        </button>

                        ${isText ? html`
                            <div class="flex-grow max-w-xs">
                                <button @click=${this._handleSaveGeneratedContent} ?disabled=${this._isLoading||this._isSaving} class="${btnPrimary}">
                                    ${this._isSaving?'Ukládám...':'💾 ' + translationService.t('editor.btn_save_section')}
                                </button>
                            </div>
                        ` : nothing}
                    </div>
                `
                : html`
                    <p class="text-slate-500 mb-6">${this.description}</p>
                    
                    ${this._createDocumentSelectorUI()}
                    
                    <div class="mt-6 pt-6 border-t border-slate-100">
                        ${this._renderDynamicInputs()}

                        ${this.contentType === 'presentation' ? html`<label class="block font-medium text-slate-600">Téma prezentace</label><input id="prompt-input-topic" type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1 mb-4" placeholder=${this.promptPlaceholder}>`:html`<textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder=${this.promptPlaceholder}></textarea>`}
                        
                        <div class="flex items-center justify-end mt-4">
                            <button @click=${this._handleGeneration} ?disabled=${this._isLoading||this._isSaving || this._isUploading} class="${btnGenerate}">
                                ${this._isLoading ? html`<div class="spinner mr-2"></div> Generuji...` : html`<span class="text-xl mr-2">✨</span> Vygenerovat pomocí AI`}
                            </button>
                        </div>
                    </div>
                    
                    <div id="generation-output" class="mt-6 border-t pt-6 text-slate-700 prose max-w-none">
                        ${this._isLoading?html`<div class="p-8 text-center pulse-loader text-slate-500">🤖 AI přemýšlí...</div>`:''}
                        ${this._generationOutput?this._renderStaticContent(this.contentType, this._generationOutput):(!this._isLoading?html`<div class="text-center p-8 text-slate-400">Obsah se vygeneruje zde...</div>`:'')}
                    </div>
                    
                    ${(this._generationOutput&&!this._generationOutput.error)?html`<div class="text-right mt-4"><button @click=${this._handleSaveGeneratedContent} ?disabled=${this._isLoading||this._isSaving} class="${btnPrimary}">${this._isSaving?'Ukládám...':'💾 ' + translationService.t('editor.btn_save_section')}</button></div>`:nothing}
                `}
            </div>`;
    }
}
customElements.define('ai-generator-panel', AiGeneratorPanel);
