import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, updateDoc, deleteField, serverTimestamp, addDoc, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { db } from '../../../firebase-init.js';
import { Localized } from '../../../utils/localization-mixin.js';
import { translationService } from '../../../utils/translation-service.js';
import { showToast } from '../../../utils/utils.js';
import { renderSelectedFiles, getSelectedFiles, renderMediaLibraryFiles, loadSelectedFiles } from '../../../utils/upload-handler.js';
import { callGenerateContent } from '../../../gemini-api.js';

const btnBase = "px-5 py-2 font-semibold rounded-lg transition transform hover:scale-105 disabled:opacity-50 disabled:scale-100 flex items-center justify-center";
const btnPrimary = `${btnBase} bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-indigo-200 w-full`;
const btnGenerate = `px-6 py-3 rounded-full font-bold bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all flex items-center ai-glow border border-white/20`;
const btnSecondary = `${btnBase} bg-slate-200 text-slate-700 hover:bg-slate-300`;
const btnDestructive = `${btnBase} bg-red-100 text-red-700 hover:bg-red-200`;

export class AiGeneratorPanel extends Localized(LitElement) {
    static properties = {
        lesson: { type: Object },
        files: { type: Array }, // Receive files from parent (LessonEditor)
        viewTitle: { type: String },
        contentType: { type: String },
        fieldToUpdate: { type: String },
        promptPlaceholder: { type: String },
        description: { type: String },
        context: { type: Object },
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
        _audioLoadingState: { state: true },
        _audioUrls: { state: true },
        onSave: { type: Function },
        autoSave: { type: Boolean }
    };

    constructor() {
        super();
        this.lesson = null;
        this.files = null; // Default to null to distinguish if prop is passed
        this.viewTitle = this.t('editor.ai.panel_title') || "AI Generátor";
        this.promptPlaceholder = "";
        this.description = this.t('editor.ai.missing_description') || "Popis chybí.";
        this.inputsConfig = []; 
        this._generationOutput = null;
        this._isLoading = false; 
        this._isSaving = false;
        this._isUploading = false; 
        this.autoSave = false;
        this._uploadProgress = 0; 
        this._uploadStatusMsg = ''; 
        this._uploadStatusType = '';
        this._showBanner = true;
        this._filesCount = 0;
        this._audioLoadingState = new Map();
        this._audioUrls = new Map();
    }

    createRenderRoot() { return this; }

    updated(changedProperties) {
        // If 'files' prop is provided (from LessonEditor), use it as source of truth
        if (changedProperties.has('files') && this.files) {
            this._filesCount = this.files.length;
            // No need to sync with global state if we are using props
            return;
        }

        // Fallback to legacy global state behavior if 'files' is not provided
        if (this.lesson || changedProperties.has('lesson')) {
            if (this.files) return; // Skip if we have files prop

            const filesInGlobalMemory = getSelectedFiles();
            const filesInLesson = this.lesson?.ragFilePaths || [];

            if (filesInLesson.length === 0 && filesInGlobalMemory.length > 0) {
                this._filesCount = filesInGlobalMemory.length;
                setTimeout(() => {
                    renderSelectedFiles(`selected-files-list-rag-${this.contentType}`);
                }, 0);
            } else {
                const shouldReload = JSON.stringify(filesInGlobalMemory.map(f=>f.fullPath)) !== JSON.stringify(filesInLesson);
                if (shouldReload || filesInGlobalMemory.length === 0) {
                     this._filesCount = filesInLesson.length;
                     setTimeout(() => {
                        loadSelectedFiles(filesInLesson);
                        renderSelectedFiles(`selected-files-list-rag-${this.contentType}`);
                     }, 0);
                } else {
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
        // If files are passed via props, we don't show this selector as it's handled by parent
        if (this.files) {
            // STRICT CHECK: Warning should ONLY appear if files array exists but is empty
            if (this.files.length > 0) return nothing;

            return html`
                <div class="mb-6 p-4 rounded-xl border bg-orange-50 border-orange-200">
                     <div class="flex justify-between items-center mb-3">
                        <h3 class="font-semibold text-orange-800">${this.t('editor.ai.rag_no_files')}</h3>
                    </div>
                    <p class="text-xs text-orange-700 mt-2 font-bold">
                        ⚠️ ${this.t('editor.ai.rag_warning_hallucination')}
                    </p>
                </div>
            `;
        }

        const listId = `selected-files-list-rag-${this.contentType}`;
        const hasFiles = this._filesCount > 0;

        return html`
            <div class="mb-6 p-4 rounded-xl border ${hasFiles ? 'bg-slate-50 border-slate-200' : 'bg-orange-50 border-orange-200'}">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="font-semibold ${hasFiles ? 'text-slate-700' : 'text-orange-800'}">
                        ${hasFiles ? this.t('editor.ai.rag_title') : this.t('editor.ai.rag_no_files')}
                    </h3>
                    <span class="text-xs ${hasFiles ? 'text-slate-500' : 'text-orange-600'} bg-white px-2 py-1 rounded border ${hasFiles ? 'border-slate-200' : 'border-orange-200'}">
                        ${this._filesCount} ${this.t('editor.ai.rag_files_count')}
                    </span>
                </div>
                
                <div class="mb-1">
                     <ul id="${listId}" class="text-sm text-slate-600 bg-white p-3 rounded-lg border border-slate-200 min-h-[50px]">
                        <li>${this.t('common.no_files_selected')}</li>
                    </ul>
                </div>

                ${!hasFiles ? html`
                    <p class="text-xs text-orange-700 mt-2 font-bold">
                        ⚠️ ${this.t('editor.ai.rag_warning_hallucination')}
                    </p>
                ` : nothing}
                
                <p class="text-xs text-slate-400 mt-2">
                    ℹ️ ${this.t('editor.ai.rag_info')}
                </p>
            </div>`;
     }

    _openRagModal(e) {
        e.preventDefault();
        const modal = document.getElementById('media-library-modal');
        if (!modal) return;
        
        renderMediaLibraryFiles("main-course", "modal-media-list");
        modal.classList.remove('hidden');
        
        const close = () => { modal.classList.add('hidden'); cleanup(); };
        const confirm = () => { 
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

    async _handleGeneration() {
        if (this._isLoading) return;
        this._isLoading = true;
        this._generationOutput = null;

        // --- 1. Unified Data Gathering (Hybrid Strategy) ---
        const promptData = {};

        // A) Internal Config (Shadow DOM / Local)
        if (this.inputsConfig) {
            this.inputsConfig.forEach(input => {
                const el = this.querySelector(`#${input.id}`);
                if (el) promptData[input.id] = el.value;
            });
        }

        // B) External/Slot Inputs (Light DOM)
        // These elements are injected via slots, so we must query them in the Light DOM.
        const externalInputs = ['question-count-input', 'difficulty-select', 'type-select', 'slide-count'];
        externalInputs.forEach(id => {
            const el = this.querySelector(`#${id}`);
            if (el) {
                // Normalize keys: 'question-count-input' -> 'question_count'
                const key = id.replace('-input', '').replace('-select', '').replace(/-/g, '_');
                promptData[key] = el.value;
            }
        });

        // --- 2. Constraint Logic ---
        let countConstraint = "";
        // specific fallback for legacy extraParams if input finding fails
        let targetCount = parseInt(promptData.question_count || promptData.slide_count || promptData.card_count || 0);

        if (!targetCount && this.extraParams && this.extraParams.question_count) {
            targetCount = this.extraParams.question_count;
        }

        if (targetCount > 0) {
            // Hard constraint for Gemini 2.5 Pro
            countConstraint = `\n\nCONSTRAINT: The user explicitly requested exactly ${targetCount} items. You MUST generate exactly ${targetCount} items in the JSON array. Failing to match this number is a critical error.`;
        }

        // --- 3. Context & Schema Injection ---
        const language = (this.context && this.context.language) || (this.lesson && this.lesson.language) || translationService.currentLanguage || 'cs';
        let contextInstruction = "";

        if (this.context) {
            if (this.context.existingText) contextInstruction += `\n\nCONTEXT - CURRENT CONTENT: "${this.context.existingText.substring(0, 1000)}..."`;
            if (this.context.targetAudience) contextInstruction += `\nCONTEXT - TARGET AUDIENCE: ${this.context.targetAudience}`;
            if (this.context.topic && !promptData.topic) promptData.topic = this.context.topic;
            if (this.context.subject && !promptData.subject) promptData.subject = this.context.subject;
        }

        let structureInstruction = "";
        switch (this.contentType) {
            case 'quiz':
            case 'test':
                structureInstruction = `\n\nOUTPUT SCHEMA: Return ONLY a JSON object with this exact structure: {"questions": [{"question": "string", "options": ["string", "string", "string", "string"], "correctAnswer": number}]}. Ensure 'correctAnswer' is an index 0-3.${countConstraint}`;
                break;
            case 'presentation':
                structureInstruction = `\n\nOUTPUT SCHEMA: Return ONLY a JSON object: {"slides": [{"title": "string", "bullets": ["string"], "content": "string"}]}.${countConstraint}`;
                break;
            case 'podcast':
                structureInstruction = `\n\nOUTPUT SCHEMA: Return ONLY a JSON object: {"script": [{"speaker": "Host" | "Guest", "text": "string"}]}.${countConstraint ? '' : ' Keep under 400 words.'}`;
                break;
            case 'post':
                structureInstruction = `\n\nOUTPUT SCHEMA: Return ONLY a JSON object with this exact structure: {"platform": "Twitter" | "LinkedIn" | "Instagram", "content": "string", "hashtags": ["string"]}.`;
                break;
            case 'flashcards':
                structureInstruction = `\n\nOUTPUT SCHEMA: Return ONLY a JSON object: {"flashcards": [{"front": "string", "back": "string"}]}.${countConstraint}`;
                break;
            case 'comic':
            case 'comic-strip':
                structureInstruction = `\n\nOUTPUT SCHEMA: Return ONLY a JSON object: {"panels": [{"description": "visual description", "caption": "speech bubble text"}]}.${countConstraint}`;
                break;
            case 'mindmap':
                structureInstruction = `\n\nOUTPUT SCHEMA: Return ONLY a JSON object: {"mermaid": "graph TD; ..."}. All node labels MUST be enclosed in double quotes.`;
                break;
        }

        const systemInstruction = `SYSTEM INSTRUCTION: Generate the response strictly in the '${language}' language. Do NOT translate standard technical terms if they are commonly used in English within this professional context.${contextInstruction}${structureInstruction}`;

        // --- 4. Consolidated Prompt Construction ---
        // DEPRECATED: appending to promptData[key]
        // ENFORCED: Always construct userPrompt containing parameters, instructions, and schema.
        promptData.userPrompt = `Generate content for ${this.contentType}. Data: ${JSON.stringify(promptData)} \n\n${systemInstruction}`;

        // --- 5. File Handling (Preserve existing logic) ---
        let filePaths = [];
        if (this.files) {
            filePaths = this.files.map(f => typeof f === 'string' ? f : (f.storagePath || f.fullPath)).filter(Boolean);
        } else {
            // Legacy global fallback
            if (typeof getSelectedFiles === 'function') {
                filePaths = getSelectedFiles().map(f => f.storagePath || f.fullPath).filter(Boolean);
            }
        }

        console.log(`[AiGenerator] Sending request. ContentType: ${this.contentType}, Items Requested: ${targetCount || 'Auto'}`);

        try {
            const result = await callGenerateContent({ 
                contentType: this.contentType, 
                promptData, 
                filePaths 
            });

            if (!result || result.error) throw new Error(result?.error || "Unknown error from AI service");

            if (result.data) {
                this._generationOutput = result.data;
                showToast(this.t('editor.ai.generation_success'), "success");

                // PROOF OF LIFE: Log the event dispatch
                console.log("AI Panel: Dispatching ai-completion event", result.data);

                // Dispatch event so parent components can react (fixing the silent failure)
                this.dispatchEvent(new CustomEvent('ai-completion', {
                    detail: { data: result.data },
                    bubbles: true,
                    composed: true
                }));

                // Auto-save if enabled (removes the need for manual save button)
                if (this.autoSave && this.onSave) {
                    await this.onSave(this._generationOutput);
                }
            } else {
                throw new Error("No data returned from AI.");
            }

        } catch (error) {
            console.error("AI Generation Error:", error);
            showToast(this.t('editor.ai.generation_failed') + ": " + error.message, "error");
        } finally {
            this._isLoading = false;
        }
    }

    _handleDiscard() {
        if (confirm(this.t('editor.ai.discard_confirm'))) {
            this._generationOutput = null;
        }
    }

    // Helper to render AI output preview based on type
    _renderStaticContent(viewId, data) {
        if (!data) return nothing;

        // FIX: Add Comic rendering support
        if (viewId === 'comic' || viewId === 'comic-strip') {
            return (data?.panels || []).map((panel, i) => html`
            <div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm bg-white flex gap-4">
                <div class="font-bold text-indigo-600 text-xl self-center">#${i + 1}</div>
                <div class="flex-grow">
                    <div class="text-sm font-semibold text-slate-700 mb-1">${this.t('editor.comic.description_label')}</div>
                    <div class="text-sm text-slate-600 italic mb-2">${panel.description}</div>
                    <div class="text-sm font-semibold text-slate-700 mb-1">${this.t('editor.comic.dialog_label')}</div>
                    <div class="bg-slate-50 p-2 rounded text-sm font-mono text-slate-800">${panel.dialogue || panel.text}</div>
                </div>
            </div>
            `);
        }

        switch (viewId) {
            case 'podcast':
                // Handle both array or wrapper object
                const script = Array.isArray(data) ? data : (data.script || data.podcast_script || []);
                return script.map(line => html`
                    <div class="flex gap-3 mb-3">
                        <div class="font-bold ${line.speaker === 'Host' ? 'text-indigo-600' : 'text-pink-600'} w-16 flex-shrink-0 text-right">
                            ${line.speaker}:
                        </div>
                        <div class="bg-slate-50 p-2 rounded text-sm text-slate-700 flex-1 border border-slate-100">
                            ${line.text}
                        </div>
                    </div>
                `);

            case 'text':
                return html`<div class="prose max-w-none p-4 bg-white rounded border border-slate-200">${data.content || data.text}</div>`;
            
            case 'presentation':
                return (data?.slides || []).map((slide, i) => html`
                    <div class="p-3 border border-slate-200 rounded mb-2 bg-white">
                        <div class="font-bold text-sm text-indigo-600">${this.t('editor.presentation.slide_n')} ${i + 1}: ${slide.title}</div>
                        <ul class="list-disc ml-5 text-xs text-slate-600 mt-1">
                            ${(slide.bullets || []).map(b => html`<li>${b}</li>`)}
                        </ul>
                    </div>
                `);

            case 'quiz':
            case 'test':
                return (data?.questions || []).map((q, i) => html`
                    <div class="p-3 border border-slate-200 rounded mb-2 bg-white">
                        <div class="font-bold text-sm text-slate-800">${i+1}. ${q.question}</div>
                        <div class="text-xs text-slate-500 mt-1 grid grid-cols-2 gap-2">
                            ${(q.options || []).map((opt, idx) => html`
                                <div class="${idx === q.correctAnswer ? 'text-green-600 font-bold' : ''}">
                                    ${String.fromCharCode(65+idx)}) ${opt}
                                </div>
                            `)}
                        </div>
                    </div>
                `);

            case 'post':
                return html`<editor-view-post .lesson="${{social_post: data}}" .isSaving="${false}"></editor-view-post>`;

            case 'mindmap':
                return html`<editor-view-mindmap .lesson="${{mindmap: data}}" .isSaving="${false}"></editor-view-mindmap>`;

            case 'flashcards':
                return html`<editor-view-flashcards .lesson="${{flashcards: data}}" .isSaving="${false}"></editor-view-flashcards>`;

            default:
                return html`<div class="p-4 bg-red-50 text-red-600 border border-red-200 rounded">${this.t('editor.ai.unknown_preview').replace('{type}', viewId)}</div>`;
        }
    }

    render() {
        return html`
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div class="bg-gradient-to-r from-slate-50 to-indigo-50/30 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <div>
                        <h2 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <span class="text-2xl">✨</span> ${this.viewTitle}
                        </h2>
                        <p class="text-sm text-slate-500 mt-0.5">${this.description}</p>
                    </div>
                    ${this._showBanner ? html`
                        <button @click="${() => this._showBanner = false}" class="text-slate-400 hover:text-slate-600">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    ` : nothing}
                </div>

                <div class="p-6">
                    ${this._createDocumentSelectorUI()}

                    <div class="space-y-4 mb-6">
                        ${this.inputsConfig.map(input => {
                            if (input.type === 'select') {
                                return html`
                                    <div>
                                        <label class="block text-sm font-medium text-slate-700 mb-1">${input.label}</label>
                                        <select id="${input.id}" class="w-full rounded-lg border-slate-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm">
                                            ${input.options.map(opt => html`<option value="${opt.value || opt}" ?selected="${(opt.value || opt) === input.default}">${opt.label || opt}</option>`)}
                                        </select>
                                    </div>
                                `;
                            }
                            if (input.type === 'textarea') {
                                return html`
                                    <div>
                                        <label class="block text-sm font-medium text-slate-700 mb-1">${input.label}</label>
                                        <textarea id="${input.id}" rows="3" class="w-full rounded-lg border-slate-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm" placeholder="${input.placeholder || ''}">${input.default || ''}</textarea>
                                    </div>
                                `;
                            }
                            return html`
                                <div>
                                    <label class="block text-sm font-medium text-slate-700 mb-1">${input.label}</label>
                                    <input type="${input.type || 'text'}" id="${input.id}"
                                        class="w-full rounded-lg border-slate-300 focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                                        placeholder="${input.placeholder || ''}"
                                        value="${input.default || ''}"
                                        min="${input.min || ''}"
                                        max="${input.max || ''}">
                                </div>
                            `;
                        })}

                        <slot name="ai-inputs"></slot>
                    </div>

                    <div class="flex justify-center mb-8">
                        <button 
                            @click="${this._handleGeneration}" 
                            ?disabled="${this._isLoading}"
                            class="${btnGenerate} ${this._isLoading ? 'opacity-75 cursor-wait' : ''}">
                            ${this._isLoading ? html`
                                <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                ${this.t('editor.ai.generating')}
                            ` : html`
                                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                ${this.t('editor.ai.generate_btn')}
                            `}
                        </button>
                    </div>

                    ${this._generationOutput ? html`
                        <div class="animate-fade-in bg-slate-50 rounded-xl border border-slate-200 p-6">
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="font-bold text-slate-800 flex items-center gap-2">
                                    <svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                    ${this.t('editor.ai.result_preview')}
                                </h3>
                            </div>

                            <div class="mb-6 max-h-[400px] overflow-y-auto custom-scrollbar">
                                ${this._renderStaticContent(this.contentType, this._generationOutput)}
                            </div>

                            <div class="flex gap-3 pt-4 border-t border-slate-200 justify-end">
                                <button @click="${this._handleDiscard}" class="${btnDestructive}">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    ${this.t('common.discard') || 'Discard'}
                                </button>
                            </div>
                        </div>
                    ` : nothing}
                </div>
            </div>
        `;
    }
}

customElements.define('ai-generator-panel', AiGeneratorPanel);
