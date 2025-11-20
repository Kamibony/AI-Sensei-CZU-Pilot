// public/js/views/professor/lesson-editor.js
import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { showToast } from '../../utils.js';
import { loadSelectedFiles } from '../../upload-handler.js';
import { doc, updateDoc, serverTimestamp, addDoc, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
// Importujeme všetky view komponenty editora
import './editor/editor-view-details.js';
import './editor/editor-view-text.js';
import './editor/editor-view-presentation.js';
import './editor/editor-view-video.js';
import './editor/editor-view-quiz.js';
import './editor/editor-view-test.js';
import './editor/editor-view-post.js';

// Helper: Renders the Stepper UI
const renderStepper = (currentStep, steps) => {
    return html`
        <div class="flex items-center justify-center mb-8">
            ${steps.map((step, index) => {
                const isActive = currentStep === index + 1;
                const isCompleted = currentStep > index + 1;
                const isLast = index === steps.length - 1;

                return html`
                    <div class="flex items-center">
                        <div class="flex flex-col items-center relative">
                            <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg z-10 transition-colors duration-300
                                ${isActive ? 'bg-green-600 text-white shadow-md' : (isCompleted ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400')}">
                                ${isCompleted ? '✓' : index + 1}
                            </div>
                            <span class="absolute -bottom-6 text-sm font-medium whitespace-nowrap transition-colors duration-300
                                ${isActive ? 'text-green-600' : 'text-slate-400'}">
                                ${step.label}
                            </span>
                        </div>
                        ${!isLast ? html`
                            <div class="w-16 sm:w-24 h-1 mx-2 rounded transition-colors duration-300 ${isCompleted ? 'bg-green-200' : 'bg-slate-100'}"></div>
                        ` : ''}
                    </div>
                `;
            })}
        </div>
    `;
};

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

        // Step definitions
        this.steps = [
            { label: 'Informace', icon: 'tag' },
            { label: 'Obsah', icon: 'pen' },
            { label: 'Dokončení', icon: 'check' }
        ];

        // Content types for Step 2 selector
        this.contentTypes = [
            { id: 'text', label: 'Text pro studenty', icon: '✍️', description: 'Vytvořte nebo vložte hlavní studijní text.' },
            { id: 'presentation', label: 'Prezentace', icon: '🖼️', description: 'AI generovaná prezentace.' },
            { id: 'video', label: 'Video', icon: '▶️', description: 'Vložte odkaz na doplňkové video.' },
            { id: 'quiz', label: 'Kvíz', icon: '❓', description: 'Rychlé ověření znalostí.' },
            { id: 'test', label: 'Test', icon: '✅', description: 'Komplexnější test pro hodnocení.' },
            { id: 'post', label: 'Podcast Skript', icon: '🎙️', description: 'Generování audio skriptů.' },
        ];
    }

    createRenderRoot() {
        return this; // Render to Light DOM
    }

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson')) {
             if (!this.lesson || (changedProperties.get('lesson') && changedProperties.get('lesson')?.id !== this.lesson?.id)) {
                 loadSelectedFiles(this.lesson?.ragFilePaths || []);
                 this._currentStep = 1; // Reset to step 1 on new lesson
                 this._selectedContentType = null;
            }
        }
    }

    connectedCallback() {
        super.connectedCallback();
        loadSelectedFiles(this.lesson?.ragFilePaths || []);
    }

    _handleLessonUpdate(e) {
        // Update local state to reflect changes immediately (e.g. title change in Step 1)
        this.lesson = { ...this.lesson, ...e.detail };
        this.requestUpdate();

        // Re-dispatch for parent components
        this.dispatchEvent(new CustomEvent('lesson-updated', {
            detail: this.lesson, bubbles: true, composed: true
        }));
    }

    // Step Navigation Logic
    _nextStep() {
        if (this._currentStep === 1) {
             // Validate Step 1
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

    // Content Type Selection
    _selectContentType(typeId) {
        this._selectedContentType = typeId;
    }

    _backToTypeSelection() {
        this._selectedContentType = null;
    }

    // Save Logic (Step 3)
    async _handleSaveLesson() {
        const detailsComponent = this.querySelector('editor-view-details');
        if (!detailsComponent) return;

        const form = detailsComponent.querySelector('#lesson-details-form');
        if (!form) return;

        const title = form.querySelector('#lesson-title-input').value.trim();
        if (!title) { showToast("Název lekce nemůže být prázdný.", true); return; }

        // Get data from Step 1 inputs
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
                // _handleLessonUpdate will handle state update if we dispatch
                this._handleLessonUpdate({ detail: updatedLesson });
                showToast("Lekce byla úspěšně uložena.");
            } else {
                lessonData.createdAt = serverTimestamp();
                lessonData.ownerId = firebaseInit.auth.currentUser.uid;
                lessonData.status = 'Naplánováno';
                const docRef = await addDoc(collection(firebaseInit.db, 'lessons'), lessonData);
                const newLesson = { id: docRef.id, ...lessonData };
                this._handleLessonUpdate({ detail: newLesson });
                showToast("Nová lekce vytvořena.");
            }
        } catch (error) {
            console.error("Error saving lesson:", error);
            showToast("Chyba při ukládání lekce.", true);
        } finally {
            this._isLoading = false;
        }
    }

    _handleBackClick() {
        this.dispatchEvent(new CustomEvent('editor-exit', { bubbles: true, composed: true }));
    }

    // Render Content Editor for Step 2 based on selection
    renderEditorContent(typeId) {
        // FIX: Pridané @lesson-updated=${this._handleLessonUpdate} pre všetky podriadené komponenty
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

    render() {
        return html`
            <div class="p-4 sm:p-6 md:p-8 overflow-y-auto h-full bg-slate-50">
                <!-- Header with Back Link -->
                <header class="mb-6">
                    <button @click=${this._handleBackClick} class="flex items-center text-sm text-green-700 hover:underline mb-2">
                         &larr; Zpět na plán výuky
                    </button>
                    <h1 class="text-2xl md:text-3xl font-bold text-slate-800">
                        ${this.lesson?.title || 'Nová lekce'}
                    </h1>
                </header>

                <!-- Stepper Indicator -->
                ${renderStepper(this._currentStep, this.steps)}

                <!-- Main Wizard Card -->
                <div class="bg-white rounded-xl shadow-sm border border-slate-100 p-4 md:p-8 min-h-[500px] flex flex-col relative">

                    <!-- Step 1: Informace -->
                    <div id="step-1-container" class="${this._currentStep === 1 ? 'block' : 'hidden'}">
                        <editor-view-details
                            .lesson=${this.lesson}
                            @lesson-updated=${this._handleLessonUpdate}>
                        </editor-view-details>
                    </div>

                    <!-- Step 2: Obsah -->
                    <div id="step-2-container" class="${this._currentStep === 2 ? 'block' : 'hidden'} h-full">
                         ${!this._selectedContentType ? html`
                            <!-- Content Type Selector Grid -->
                            <div class="text-center mb-8">
                                <h3 class="text-xl font-semibold text-slate-700 mb-2">Jaký obsah chcete vytvořit?</h3>
                                <p class="text-slate-500">Vyberte typ obsahu, který chcete přidat nebo upravit.</p>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                ${this.contentTypes.map(type => {
                                     // Check content existence simply
                                     const hasContent = this.lesson && ((type.id === 'text' && this.lesson.text_content) || (this.lesson[type.id]));

                                     return html`
                                    <button @click=${() => this._selectContentType(type.id)}
                                            class="flex flex-col items-center p-6 rounded-xl border-2 transition-all duration-200
                                                   ${hasContent ? 'border-green-200 bg-green-50 hover:border-green-400' : 'border-slate-100 bg-white hover:border-indigo-200 hover:shadow-md'}">
                                        <div class="w-12 h-12 rounded-full flex items-center justify-center text-2xl mb-3
                                                    ${hasContent ? 'bg-green-100 text-green-600' : 'bg-indigo-50 text-indigo-600'}">
                                            ${type.icon}
                                        </div>
                                        <span class="font-semibold text-slate-800">${type.label}</span>
                                        <span class="text-xs text-slate-500 mt-1 text-center">${type.description}</span>
                                        ${hasContent ? html`<span class="mt-2 text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Hotovo</span>` : ''}
                                    </button>
                                `})}
                            </div>
                         ` : html`
                            <!-- Active Content Editor -->
                            <div class="flex flex-col h-full">
                                <button @click=${this._backToTypeSelection} class="self-start mb-4 flex items-center text-sm text-slate-500 hover:text-indigo-600 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><circle cx="12" cy="12" r="10"></circle><polyline points="12 8 8 12 12 16"></polyline><line x1="16" y1="12" x2="8" y2="12"></line></svg>
                                    Změnit typ obsahu
                                </button>
                                <div class="flex-grow">
                                    ${this.renderEditorContent(this._selectedContentType)}
                                </div>
                            </div>
                         `}
                    </div>

                    <!-- Step 3: Dokončení -->
                    <div id="step-3-container" class="${this._currentStep === 3 ? 'block' : 'hidden'} text-center py-8">
                        <div class="max-w-lg mx-auto">
                            <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-4xl mx-auto mb-6">
                                ✨
                            </div>
                            <h2 class="text-2xl font-bold text-slate-800 mb-2">Lekce je připravena!</h2>
                            <p class="text-slate-500 mb-8">
                                Zkontrolujte prosím, zda máte vyplněny všechny potřebné údaje.
                                Po uložení bude lekce dostupná v seznamu, ale pro studenty bude viditelná až po publikování (změna stavu na 'Aktivní').
                            </p>

                            <div class="bg-slate-50 rounded-lg p-6 mb-8 text-left border border-slate-200">
                                <h4 class="font-semibold text-slate-700 mb-2">Souhrn:</h4>
                                <ul class="space-y-2 text-sm text-slate-600">
                                    <li class="flex items-center"><span class="w-4 mr-2">🏷️</span> Název: <strong>${this.lesson?.title || '(Nevyplněno)'}</strong></li>
                                    <li class="flex items-center"><span class="w-4 mr-2">👥</span> Přiřazeno třídám: <strong>${(this.lesson?.assignedToGroups || []).length}</strong></li>
                                    <li class="flex items-center"><span class="w-4 mr-2">📄</span> Obsah: <strong>${this.lesson?.text_content ? 'Ano' : 'Ne'}</strong></li>
                                </ul>
                            </div>

                            <!-- Final Actions -->
                            <div class="flex justify-center space-x-4">
                                <button id="save-lesson-btn"
                                        @click=${this._handleSaveLesson}
                                        ?disabled=${this._isLoading}
                                        class="px-8 py-3 rounded-lg bg-green-600 text-white font-bold shadow-lg hover:bg-green-700 hover:shadow-xl transform hover:-translate-y-0.5 transition-all flex items-center">
                                    ${this._isLoading ? html`<div class="spinner mr-2"></div>` : html`<span class="mr-2">💾</span>`}
                                    Uložit a dokončit
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Navigation Footer -->
                    <div class="mt-auto pt-8 border-t border-slate-100 flex justify-between items-center">
                        <button @click=${this._prevStep}
                                class="px-6 py-2 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors ${this._currentStep === 1 ? 'invisible' : ''}">
                            Zpět
                        </button>

                        ${this._currentStep < 3 ? html`
                            <button @click=${this._nextStep}
                                    class="px-6 py-2 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-900 shadow-md transition-all flex items-center">
                                Dále
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ml-2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </button>
                        ` : nothing}
                    </div>

                </div>
            </div>
        `;
    }
}

customElements.define('lesson-editor', LessonEditor);
