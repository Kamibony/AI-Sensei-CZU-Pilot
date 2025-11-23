// public/js/views/professor/lesson-editor.js
import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { showToast } from '../../utils.js';
import { loadSelectedFiles } from '../../upload-handler.js';
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
    };

    constructor() {
        super();
        this.lesson = null;
        this._currentStep = 1;
        this._selectedContentType = null;
        this._isLoading = false;

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
                 this._selectedContentType = null;
            }
        }
    }

    connectedCallback() {
        super.connectedCallback();
        loadSelectedFiles(this.lesson?.ragFilePaths || []);
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
             }
        }
        if (this._currentStep < 3) {
            this._currentStep++;
            this.requestUpdate();
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
        const detailsComponent = this.querySelector('editor-view-details');
        if (!detailsComponent) return;

        const form = detailsComponent.querySelector('#lesson-details-form');
        if (!form) return;

        const title = form.querySelector('#lesson-title-input').value.trim();
        if (!title) { showToast("Název lekce nemůže být prázdný.", true); return; }

        const subtitle = form.querySelector('#lesson-subtitle-input').value.trim();
        const number = form.querySelector('#lesson-number-input').value.trim();
        const icon = form.querySelector('#lesson-icon-input').value.trim() || '🆕';

        const selectedGroups = Array.from(form.querySelectorAll('input[name="group-assignment"]:checked')).map(cb => cb.value);

        const { getSelectedFiles } = await import('../../upload-handler.js');
        const currentSelection = getSelectedFiles();

        const lessonData = {
            title, subtitle, number, icon,
            ragFilePaths: currentSelection,
            assignedToGroups: selectedGroups,
            updatedAt: serverTimestamp()
        };

        this._isLoading = true;
        try {
            if (this.lesson?.id) {
                if (!this.lesson.ownerId) lessonData.ownerId = firebaseInit.auth.currentUser.uid;
                await updateDoc(doc(firebaseInit.db, 'lessons', this.lesson.id), lessonData);
                const updatedLesson = { ...this.lesson, ...lessonData };
                this._handleLessonUpdate({ detail: updatedLesson });
                showToast("Lekce uložena.");
            } else {
                lessonData.createdAt = serverTimestamp();
                lessonData.ownerId = firebaseInit.auth.currentUser.uid;
                lessonData.status = 'Naplánováno';
                const docRef = await addDoc(collection(firebaseInit.db, 'lessons'), lessonData);
                const newLesson = { id: docRef.id, ...lessonData };
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

                        <!-- Step 1: Details (Zen Inputs) -->
                        <div class="${this._currentStep === 1 ? 'block' : 'hidden'} animate-fade-in">
                             <editor-view-details
                                .lesson=${this.lesson}
                                @lesson-updated=${this._handleLessonUpdate}>
                            </editor-view-details>
                        </div>

                        <!-- Step 2: Content Selection (Grid of Big Buttons) -->
                        <div class="${this._currentStep === 2 ? 'block' : 'hidden'} h-full animate-fade-in">
                            ${!this._selectedContentType ? html`
                                <div class="text-center mb-12">
                                    <h2 class="text-4xl font-bold text-slate-900 mb-4 tracking-tight">Co vytvoříme?</h2>
                                    <p class="text-slate-500 text-lg">Vyberte formát pro tuto lekci.</p>
                                </div>

                                <div class="grid grid-cols-2 md:grid-cols-3 gap-6">
                                    ${this.contentTypes.map(type => {
                                        const hasContent = this.lesson && ((type.id === 'text' && this.lesson.text_content) || (this.lesson[type.id]));
                                        return html`
                                            <button @click=${() => this._selectContentType(type.id)}
                                                    class="group relative bg-white p-8 rounded-3xl text-left transition-all duration-300 border border-slate-100 hover:border-transparent hover:shadow-2xl hover:shadow-slate-200/50 hover:-translate-y-1">

                                                ${hasContent ? html`
                                                    <div class="absolute top-4 right-4 w-2 h-2 bg-green-500 rounded-full"></div>
                                                ` : ''}

                                                <div class="text-5xl mb-6 filter grayscale group-hover:grayscale-0 transition-all duration-500 transform group-hover:scale-110 origin-left">
                                                    ${type.icon}
                                                </div>

                                                <h3 class="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">${type.label}</h3>
                                                <p class="text-xs text-slate-400 mt-2 font-medium">${type.description}</p>
                                            </button>
                                        `;
                                    })}
                                </div>
                            ` : html`
                                <!-- Active Editor Mode -->
                                <div class="flex flex-col h-full">
                                    <div class="flex items-center justify-between mb-6 pb-6 border-b border-slate-50">
                                        <div class="flex items-center">
                                            <span class="text-2xl mr-3">${this.contentTypes.find(t => t.id === this._selectedContentType)?.icon}</span>
                                            <h3 class="text-xl font-bold text-slate-900">${this.contentTypes.find(t => t.id === this._selectedContentType)?.label}</h3>
                                        </div>
                                        <button @click=${this._backToTypeSelection} class="text-sm font-medium text-slate-400 hover:text-indigo-600 transition-colors">
                                            Změnit výběr
                                        </button>
                                    </div>
                                    <div class="flex-grow">
                                        ${this.renderEditorContent(this._selectedContentType)}
                                    </div>
                                </div>
                            `}
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
