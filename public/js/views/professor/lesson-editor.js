// public/js/views/professor/lesson-editor.js
import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { showToast } from '../../utils.js';
import { loadSelectedFiles, renderSelectedFiles, initializeCourseMediaUpload, getSelectedFiles } from '../../upload-handler.js';
import { callGenerateContent } from '../../gemini-api.js';
import { doc, updateDoc, serverTimestamp, addDoc, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import './editor/editor-view-details.js';
import './editor/editor-view-text.js';
import './editor/editor-view-presentation.js';
import './editor/editor-view-video.js';
import './editor/editor-view-quiz.js';
import './editor/editor-view-test.js';
import './editor/editor-view-post.js';

export class LessonEditor extends LitElement {
    static properties = {
        lesson: { type: Object },
        _currentStep: { state: true, type: Number },
        _selectedContentType: { state: true, type: String },
        _isLoading: { state: true, type: Boolean },
        _magicProgress: { state: true, type: String },
    };

    constructor() {
        super();
        this.lesson = null;
        this._currentStep = 1;
        this._selectedContentType = null;
        this._isLoading = false;
        this._magicProgress = '';

        this.steps = [
            { label: 'Základy', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
            { label: 'Obsah', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
            { label: 'Hotovo', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' }
        ];

        this.contentTypes = [
            { id: 'text', label: 'Text', icon: '✍️', description: 'Studijní text a materiály' },
            { id: 'presentation', label: 'Prezentace', icon: '🖼️', description: 'AI generované slajdy' },
            { id: 'video', label: 'Video', icon: '▶️', description: 'YouTube nebo odkaz' },
            { id: 'quiz', label: 'Kvíz', icon: '❓', description: 'Rychlé ověření' },
            { id: 'test', label: 'Test', icon: '✅', description: 'Hodnocený test' },
            { id: 'post', label: 'Audio', icon: '🎙️', description: 'Podcast skript' },
        ];
    }

    createRenderRoot() { return this; }

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson')) {
             if (!this.lesson || (changedProperties.get('lesson') && changedProperties.get('lesson')?.id !== this.lesson?.id)) {
                 loadSelectedFiles(this.lesson?.ragFilePaths || []);
                 this._currentStep = 1;
                 this._selectedContentType = 'text'; // Default to first tab
            }
        }
    }

    connectedCallback() {
        super.connectedCallback();
        loadSelectedFiles(this.lesson?.ragFilePaths || []);
    }

    updated(changedProperties) {
        // Only re-initialize upload if we specifically switched TO Step 1
        if (changedProperties.has('_currentStep') && this._currentStep === 1) {
            setTimeout(() => {
                initializeCourseMediaUpload('main-course', () => {
                     const currentFiles = getSelectedFiles();
                     this.lesson = { ...this.lesson, ragFilePaths: currentFiles };
                     renderSelectedFiles('uploaded-files-list-step1');
                }, this.renderRoot);
                renderSelectedFiles('uploaded-files-list-step1');
            }, 0);
        }
    }

    _handleLessonUpdate(e) {
        this.lesson = { ...this.lesson, ...e.detail };
        this.requestUpdate();
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: this.lesson, bubbles: true, composed: true
        }));
    }

    _nextStep() {
        if (this._currentStep === 1) {
             const detailsComponent = this.querySelector('editor-view-details');
             if (detailsComponent) {
                 const titleInput = detailsComponent.querySelector('#lesson-title-input');
                 if (!titleInput || !titleInput.value.trim()) {
                     showToast("Vyplňte prosím název lekce.", true);
                     if(titleInput) titleInput.focus();
                     return;
                 }
                 // Save basic info to local state
                 this.lesson = { ...this.lesson, ...detailsComponent.getDetails() };
             }
        }
        if (this._currentStep < 3) {
            this._currentStep++;
            this.requestUpdate();
            if (this._currentStep === 2 && !this._selectedContentType) {
                this._selectedContentType = 'text';
            }
        }
    }

    _prevStep() {
        if (this._currentStep > 1) {
            this._currentStep--;
            this.requestUpdate();
        }
    }

    _selectContentType(typeId) {
        this._selectedContentType = typeId;
    }

    _backToTypeSelection() {
        this._selectedContentType = null;
    }

    async _handleSaveLesson() {
        // Collect data from Step 1 (which might be hidden now, so we rely on this.lesson being updated)
        // If we are on Step 3, detailsComponent might not be in DOM if hidden by CSS
        // However, we updated this.lesson on _nextStep.

        // Re-read from component if available (safe check)
        const detailsComponent = this.querySelector('editor-view-details');
        let detailsData = {};
        if (detailsComponent && detailsComponent.getDetails) {
            detailsData = detailsComponent.getDetails();
        }

        // Merge current lesson state with any fresh details
        const finalLessonData = { ...this.lesson, ...detailsData };

        if (!finalLessonData.title) { showToast("Název lekce nemůže být prázdný.", true); return; }

        const { getSelectedFiles } = await import('../../upload-handler.js');
        const currentSelection = getSelectedFiles();

        const lessonPayload = {
            title: finalLessonData.title,
            subtitle: finalLessonData.subtitle || '',
            number: finalLessonData.number || '',
            icon: finalLessonData.icon || '🆕',
            ragFilePaths: currentSelection,
            assignedToGroups: finalLessonData.assignedToGroups || [],
            updatedAt: serverTimestamp(),
            // Save generated content fields
            text_content: finalLessonData.text_content || null,
            presentation: finalLessonData.presentation || null,
            quiz: finalLessonData.quiz || null,
            test: finalLessonData.test || null,
            post: finalLessonData.post || null,
        };

        this._isLoading = true;
        try {
            if (this.lesson?.id) {
                if (!this.lesson.ownerId) lessonPayload.ownerId = firebaseInit.auth.currentUser.uid;
                await updateDoc(doc(firebaseInit.db, 'lessons', this.lesson.id), lessonPayload);
                const updatedLesson = { ...this.lesson, ...lessonPayload };
                this._handleLessonUpdate({ detail: updatedLesson });
                showToast("Lekce uložena.");
            } else {
                lessonPayload.createdAt = serverTimestamp();
                lessonPayload.ownerId = firebaseInit.auth.currentUser.uid;
                lessonPayload.status = 'Naplánováno';
                const docRef = await addDoc(collection(firebaseInit.db, 'lessons'), lessonPayload);
                const newLesson = { id: docRef.id, ...lessonPayload };
                this._handleLessonUpdate({ detail: newLesson });
                showToast("Lekce vytvořena.");
            }
        } catch (error) {
            console.error("Error saving lesson:", error);
            showToast("Chyba při ukládání.", true);
        } finally {
            this._isLoading = false;
        }
    }

    async _handleMagicGeneration() {
        const detailsComponent = this.querySelector('editor-view-details');
        if (!detailsComponent) return;

        // Validation
        const title = detailsComponent.querySelector('#lesson-title-input').value.trim();
        if (!title) { showToast("Nejdříve zadejte název lekce.", true); return; }

        // Save Basic Info First locally
        this.lesson = { ...this.lesson, ...detailsComponent.getDetails() };

        // Get Files
        const currentFiles = getSelectedFiles();
        if (currentFiles.length === 0) {
            if (!confirm("Generujete bez nahraných souborů. AI bude vařit z vody (pouze z názvu). Chcete pokračovat?")) return;
        }

        const filePaths = currentFiles.map(f => f.fullPath);
        this._isLoading = true;

        const typesToGenerate = ['text', 'presentation', 'quiz', 'test', 'post'];

        try {
            for (const type of typesToGenerate) {
                this._magicProgress = `Generuji ${this.contentTypes.find(t=>t.id===type).label}...`;
                this.requestUpdate();

                // Build Prompt Data
                const promptData = {
                    userPrompt: `Téma lekce: ${this.lesson.title}. ${this.lesson.subtitle || ''}`,
                    slide_count: 5 // Default for magic
                };

                const result = await callGenerateContent({ contentType: type, promptData, filePaths });

                if (result && !result.error) {
                    const dataKey = type === 'text' ? 'text_content' : type;
                    const dataValue = (type === 'text' && result.text) ? result.text : result;
                    this.lesson = { ...this.lesson, [dataKey]: dataValue };
                } else {
                    console.warn(`Magic generation failed for ${type}:`, result?.error);
                }
            }

            this._magicProgress = '';
            showToast("Magie dokončena! Zkontrolujte vygenerovaný obsah.");
            this._nextStep(); // Go to content step

        } catch (e) {
            console.error("Magic generation fatal error:", e);
            showToast("Chyba při generování: " + e.message, true);
        } finally {
            this._isLoading = false;
            this._magicProgress = '';
        }
    }

    _handleBackClick() {
        this.dispatchEvent(new CustomEvent('editor-exit', { bubbles: true, composed: true }));
    }

    renderEditorContent(typeId) {
        switch(typeId) {
            case 'text': return html`<editor-view-text .lesson=${this.lesson} @lesson-updated=${this._handleLessonUpdate}></editor-view-text>`;
            case 'presentation': return html`<editor-view-presentation .lesson=${this.lesson} @lesson-updated=${this._handleLessonUpdate}></editor-view-presentation>`;
            case 'video': return html`<editor-view-video .lesson=${this.lesson} @lesson-updated=${this._handleLessonUpdate}></editor-view-video>`;
            case 'quiz': return html`<editor-view-quiz .lesson=${this.lesson} @lesson-updated=${this._handleLessonUpdate}></editor-view-quiz>`;
            case 'test': return html`<editor-view-test .lesson=${this.lesson} @lesson-updated=${this._handleLessonUpdate}></editor-view-test>`;
            case 'post': return html`<editor-view-post .lesson=${this.lesson} @lesson-updated=${this._handleLessonUpdate}></editor-view-post>`;
            default: return html`<p class="text-red-500">Neznámý typ obsahu</p>`;
        }
    }

    // Minimalist Stepper
    _renderStepper() {
        return html`
            <div class="flex items-center justify-center space-x-4 mb-12">
                ${this.steps.map((step, index) => {
                    const isActive = this._currentStep === index + 1;
                    const isCompleted = this._currentStep > index + 1;

                    return html`
                        <div class="flex items-center group">
                            <div class="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-all duration-300
                                ${isActive ? 'bg-slate-900 text-white scale-110' :
                                  isCompleted ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}">
                                ${isCompleted ? '✓' : index + 1}
                            </div>
                             ${isActive ? html`<span class="ml-2 text-sm font-bold text-slate-900">${step.label}</span>` : ''}
                             ${index < this.steps.length - 1 ? html`
                                <div class="w-12 h-[2px] mx-2 ${isCompleted ? 'bg-green-500' : 'bg-slate-100'}"></div>
                             ` : ''}
                        </div>
                    `;
                })}
            </div>
        `;
    }

    render() {
        return html`
            <div class="h-full bg-white overflow-y-auto">
                <!-- Zen Mode Container -->
                <div class="max-w-3xl mx-auto px-6 py-12 flex flex-col h-full">

                    <!-- Simple Header -->
                    <header class="flex items-center justify-between mb-8">
                        <button @click=${this._handleBackClick} class="group flex items-center text-sm font-medium text-slate-400 hover:text-slate-900 transition-colors">
                            <div class="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center mr-2 group-hover:bg-slate-100 transition-colors">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                            </div>
                            Zpět
                        </button>
                        ${this.lesson?.id ? html`<span class="text-xs font-mono text-slate-300 uppercase tracking-widest">ID: ${this.lesson.id.substring(0,6)}</span>` : ''}
                    </header>

                    ${this._renderStepper()}

                    <div class="flex-grow relative">

                        <!-- Step 1: Details (Zen Inputs + Magic) -->
                        <div class="${this._currentStep === 1 ? 'block' : 'hidden'} animate-fade-in space-y-8">
                             <editor-view-details
                                .lesson=${this.lesson}
                                @lesson-updated=${this._handleLessonUpdate}>
                            </editor-view-details>

                            <!-- File Upload Zone (Replaces old Step 2 grid logic for upload) -->
                            <div class="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center transition-all hover:border-indigo-300 hover:bg-indigo-50/30 group" id="course-media-upload-area">
                                <div class="mb-4">
                                    <span class="text-4xl group-hover:scale-110 transition-transform inline-block">📄</span>
                                </div>
                                <h3 class="text-lg font-bold text-slate-700">Podklady pro AI</h3>
                                <p class="text-sm text-slate-500 mb-6">Nahrajte PDF skripta, prezentace nebo texty. AI z nich vytvoří lekci.</p>

                                <input type="file" id="course-media-file-input" class="hidden" multiple accept=".pdf,.txt,.docx,.pptx">
                                <button class="pointer-events-none bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium shadow-sm group-hover:text-indigo-600 group-hover:border-indigo-200">
                                    Vybrat soubory
                                </button>

                                <div id="upload-progress-container" class="hidden mt-4 max-w-md mx-auto"></div>
                                <ul id="uploaded-files-list-step1" class="mt-4 text-left max-w-md mx-auto space-y-2"></ul>
                            </div>

                            <!-- Action Buttons -->
                            <div class="flex flex-col sm:flex-row gap-4 justify-center pt-8">
                                <button @click=${this._handleMagicGeneration} ?disabled=${this._isLoading}
                                    class="flex-1 py-4 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold shadow-xl shadow-indigo-200 hover:shadow-indigo-300 hover:-translate-y-1 transition-all flex items-center justify-center text-lg">
                                    ${this._isLoading ? html`<span class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-3"></span> ${this._magicProgress}` : html`<span class="mr-2">✨</span> Magicky Vygenerovat Vše`}
                                </button>

                                <button @click=${this._nextStep} ?disabled=${this._isLoading}
                                    class="flex-1 py-4 px-6 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 hover:text-slate-900 transition-all flex items-center justify-center text-lg">
                                    Manuální Tvorba <span class="ml-2">→</span>
                                </button>
                            </div>
                        </div>

                        <!-- Step 2: Content Selection (Tabbed Navigation) -->
                        <div class="${this._currentStep === 2 ? 'block' : 'hidden'} h-full animate-fade-in flex flex-col">

                            <!-- Tab Bar -->
                            <div class="flex space-x-1 bg-slate-100 p-1 rounded-xl mb-6 overflow-x-auto no-scrollbar">
                                ${this.contentTypes.map(type => {
                                    const isActive = this._selectedContentType === type.id;
                                    const hasContent = this.lesson && ((type.id === 'text' && this.lesson.text_content) || (this.lesson[type.id]));
                                    return html`
                                        <button @click=${() => this._selectContentType(type.id)}
                                            class="flex items-center px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap
                                            ${isActive ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}">
                                            <span class="mr-2 ${isActive ? '' : 'filter grayscale'}">${type.icon}</span>
                                            ${type.label}
                                            ${hasContent ? html`<span class="ml-2 w-1.5 h-1.5 bg-green-500 rounded-full"></span>` : ''}
                                        </button>
                                    `;
                                })}
                            </div>

                            <!-- Active Editor Content -->
                            <div class="flex-grow bg-white rounded-2xl border border-slate-100 shadow-sm p-1 overflow-y-auto">
                                ${this.renderEditorContent(this._selectedContentType)}
                            </div>
                        </div>

                        <!-- Step 3: Completion -->
                        <div class="${this._currentStep === 3 ? 'block' : 'hidden'} animate-fade-in text-center pt-12">
                            <div class="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse-slow">
                                <span class="text-5xl">✨</span>
                            </div>
                            <h2 class="text-3xl font-bold text-slate-900 mb-4">Vše připraveno!</h2>
                            <p class="text-slate-500 max-w-md mx-auto mb-12">
                                Vaše lekce "${this.lesson?.title || '...'}" je připravena k uložení.
                                Po uložení ji najdete v knihovně.
                            </p>

                            <button id="save-lesson-btn"
                                    @click=${this._handleSaveLesson}
                                    ?disabled=${this._isLoading}
                                    class="group relative inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white transition-all duration-200 bg-indigo-600 rounded-full hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5">
                                ${this._isLoading ? html`<span class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>` : ''}
                                <span>Publikovat Lekci</span>
                                <svg class="w-5 h-5 ml-2 -mr-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                            </button>
                        </div>
                    </div>

                    <!-- Footer Navigation -->
                    <div class="mt-12 pt-6 border-t border-slate-50 flex justify-between items-center">
                         <button @click=${this._prevStep}
                                class="px-6 py-2 text-sm font-medium text-slate-400 hover:text-slate-900 transition-colors ${this._currentStep === 1 ? 'invisible' : ''}">
                            Zpět
                        </button>

                        ${this._currentStep < 3 ? html`
                            <button @click=${this._nextStep}
                                    class="group flex items-center px-6 py-2 bg-slate-900 text-white rounded-full text-sm font-bold hover:bg-black transition-all hover:shadow-lg">
                                Pokračovat
                                <svg class="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                            </button>
                        ` : nothing}
                    </div>
                </div>
            </div>
            <style>
                /* Custom Animations for Zen Feel */
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
                .animate-pulse-slow { animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

                /* --- ZEN MODE OVERRIDES for child component (editor-view-details) --- */
                /* Remove card styling from child */
                editor-view-details .bg-white { background: transparent !important; box-shadow: none !important; padding: 0 !important; }
                /* Hide duplicate header */
                editor-view-details h2 { display: none !important; }

                /* Invisible Inputs Style */
                editor-view-details input[type="text"] {
                    background: transparent !important;
                    border: none !important;
                    border-bottom: 1px solid #e2e8f0 !important; /* slate-200 */
                    border-radius: 0 !important;
                    padding: 0.75rem 0 !important;
                    box-shadow: none !important;
                    transition: all 0.3s ease !important;
                }
                editor-view-details input[type="text"]:focus {
                    border-bottom: 2px solid #4f46e5 !important; /* indigo-600 */
                    ring: 0 !important;
                    outline: none !important;
                }

                /* Make Title HUGE */
                editor-view-details #lesson-title-input {
                    font-size: 2.25rem !important; /* text-4xl */
                    line-height: 2.5rem !important;
                    font-weight: 800 !important;
                    color: #0f172a !important; /* slate-900 */
                    margin-bottom: 1rem !important;
                }
                editor-view-details #lesson-title-input::placeholder {
                    color: #cbd5e1 !important; /* slate-300 */
                }

                /* Make Subtitle Large */
                editor-view-details #lesson-subtitle-input {
                    font-size: 1.25rem !important; /* text-xl */
                    color: #64748b !important; /* slate-500 */
                }

                /* Hide labels for Title/Subtitle as placeholders are enough in Zen Mode */
                editor-view-details label {
                    display: block;
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #94a3b8; /* slate-400 */
                    margin-bottom: 0.25rem;
                    margin-top: 1rem;
                }

            </style>
        `;
    }
}
customElements.define('lesson-editor', LessonEditor);
