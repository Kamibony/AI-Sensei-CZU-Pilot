import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { showToast } from '../../utils.js';
import { loadSelectedFiles, renderSelectedFiles, initializeCourseMediaUpload, getSelectedFiles, renderMediaLibraryFiles } from '../../upload-handler.js';
import { callGenerateContent } from '../../gemini-api.js';
import { doc, updateDoc, serverTimestamp, addDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../../firebase-init.js';
import { StudentLessonDetail } from '../../student/student-lesson-detail.js';
import './editor/editor-view-text.js';
import './editor/editor-view-presentation.js';
import './editor/editor-view-video.js';
import './editor/editor-view-quiz.js';
import './editor/editor-view-test.js';
import './editor/editor-view-post.js';
import './editor/editor-view-comic.js';
import './editor/editor-view-flashcards.js';
import './editor/editor-view-mindmap.js';

export class LessonEditor extends LitElement {
    static properties = {
        lesson: { type: Object },
        _currentStep: { state: true, type: Number },
        _selectedContentType: { state: true, type: String },
        _isLoading: { state: true, type: Boolean },
        _magicProgress: { state: true, type: String },
        _viewMode: { state: true, type: String },
        _groups: { state: true, type: Array },
        _showStudentPreview: { state: true, type: Boolean },
    };

    constructor() {
        super();
        this.lesson = null;
        this._currentStep = 1;
        this._selectedContentType = null;
        this._isLoading = false;
        this._magicProgress = '';
        this._viewMode = 'settings'; // Default to settings (creation mode) for new lessons
        this._groups = [];
        this._showStudentPreview = false;

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
            { id: 'comic', label: 'Komiks', icon: '🎨', description: 'Humorný komiks k lekci' },
            { id: 'flashcards', label: 'Kartičky', icon: '🗂️', description: 'Opakování pojmů' },
            { id: 'mindmap', label: 'Mapa', icon: '🧠', description: 'Mentální mapa souvislostí' }
        ];
    }

    createRenderRoot() { return this; }

    willUpdate(changedProperties) {
        if (changedProperties.has('lesson')) {
             if (!this.lesson || (changedProperties.get('lesson') && changedProperties.get('lesson')?.id !== this.lesson?.id)) {
                 loadSelectedFiles(this.lesson?.ragFilePaths || []);
                 this._currentStep = 1;
                 // Hub Logic: New Lesson -> Settings (Step 1), Existing -> Hub
                 if (this.lesson?.id) {
                     this._viewMode = 'hub';
                     this._selectedContentType = null;
                 } else {
                     this._viewMode = 'settings';
                     this._selectedContentType = 'text';
                 }
            }
        }
    }

    connectedCallback() {
        super.connectedCallback();
        loadSelectedFiles(this.lesson?.ragFilePaths || []);
        this._fetchGroups();

        // Check URL params to restore state
        const params = new URLSearchParams(window.location.search);
        const viewMode = params.get('viewMode');
        const contentType = params.get('contentType');

        if (viewMode) {
            this._viewMode = viewMode;
            if (viewMode === 'editor' && contentType) {
                this._selectedContentType = contentType;
            } else if (viewMode === 'hub') {
                this._selectedContentType = null;
            }
        }
    }

    async _fetchGroups() {
        const currentUser = firebaseInit.auth.currentUser;
        if (!currentUser) return;

        try {
            const groupsQuery = query(
                collection(firebaseInit.db, "groups"),
                where("ownerId", "==", currentUser.uid)
            );
            const querySnapshot = await getDocs(groupsQuery);
            this._groups = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching groups:", error);
            showToast("Nepodařilo se načíst skupiny.", true);
        }
    }

    _updateUrlParams() {
        const url = new URL(window.location);
        url.searchParams.set('viewMode', this._viewMode);

        if (this._selectedContentType) {
            url.searchParams.set('contentType', this._selectedContentType);
        } else {
            url.searchParams.delete('contentType');
        }

        // Only push if changed
        if (window.location.search !== url.search) {
            window.history.pushState({}, '', url);
        }
    }

    updated(changedProperties) {
        // Only re-initialize upload if we specifically switched TO Step 1
        if (changedProperties.has('_currentStep') && this._currentStep === 1) {
            setTimeout(() => {
                initializeCourseMediaUpload('main-course', () => {
                     const currentFiles = getSelectedFiles();
                     this.lesson = { ...this.lesson, ragFilePaths: currentFiles };
                     renderSelectedFiles('course-media-list-container');
                }, this.renderRoot);
                renderSelectedFiles('course-media-list-container');
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

    _switchToHub() {
         // Validate Step 1 if coming from settings
         if (this._viewMode === 'settings') {
             const titleInput = this.renderRoot.querySelector('#lesson-title-input');
             // Only block if trying to leave empty title on NEW lesson
             if ((!titleInput || !titleInput.value.trim()) && !this.lesson?.title) {
                 showToast("Vyplňte prosím název lekce.", true);
                 if(titleInput) titleInput.focus();
                 return;
             }
             // Save basic info to local state
             this.lesson = { ...this.lesson, ...this._getDetails() };
         }
         this._viewMode = 'hub';
         this._selectedContentType = null;
         this._updateUrlParams();
    }

    _switchToSettings() {
        this._viewMode = 'settings';
        this._updateUrlParams();
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

    _getDetails() {
        const title = this.renderRoot.querySelector('#lesson-title-input')?.value.trim() || '';
        const subtitle = this.renderRoot.querySelector('#lesson-subtitle-input')?.value.trim() || '';
        const assignedToGroups = Array.from(this.renderRoot.querySelectorAll('input[name="group-assignment"]:checked')).map(cb => cb.value);

        return { title, subtitle, assignedToGroups };
    }

    async _handleSaveLesson() {
        // Collect data from Step 1
        const detailsData = this._getDetails();

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
            comic: finalLessonData.comic || null,
            comic_script: finalLessonData.comic_script || null,
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
        // Validation
        const titleInput = this.renderRoot.querySelector('#lesson-title-input');
        if (!titleInput || !titleInput.value.trim()) { showToast("Nejdříve zadejte název lekce.", true); return; }

        // Save Basic Info First locally
        this.lesson = { ...this.lesson, ...this._getDetails() };

        // Get Files
        const currentFiles = getSelectedFiles();
        if (currentFiles.length === 0) {
            if (!confirm("Generujete bez nahraných souborů. AI bude vařit z vody (pouze z názvu). Chcete pokračovat?")) return;
        }

        const filePaths = currentFiles.map(f => f.fullPath);
        this._isLoading = true;

        // Save initial structure to DB to ensure we have an ID
        try {
            if (!this.lesson.id) {
                const lessonPayload = {
                    title: this.lesson.title,
                    subtitle: this.lesson.subtitle || '',
                    number: this.lesson.number || '',
                    icon: this.lesson.icon || '🆕',
                    ragFilePaths: currentFiles,
                    assignedToGroups: this.lesson.assignedToGroups || [],
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    ownerId: firebaseInit.auth.currentUser.uid,
                    status: 'Naplánováno'
                };
                const docRef = await addDoc(collection(firebaseInit.db, 'lessons'), lessonPayload);
                this.lesson = { ...this.lesson, id: docRef.id, ...lessonPayload };
                this.requestUpdate();
                this._handleLessonUpdate({ detail: this.lesson }); // Sync
            }
        } catch (e) {
            console.error("Failed to create initial lesson doc:", e);
            showToast("Chyba při inicializaci lekce: " + e.message, true);
            this._isLoading = false;
            return;
        }

        const typesToGenerate = ['text', 'presentation', 'quiz', 'test', 'post', 'comic', 'flashcards', 'mindmap'];

        try {
            for (const type of typesToGenerate) {
                this._magicProgress = `Generuji ${this.contentTypes.find(t=>t.id===type).label}...`;
                this.requestUpdate();

                let specificPrompt = `Téma lekce: ${this.lesson.title}. ${this.lesson.subtitle || ''}`;
                let episodeCount = undefined;

                if (type === 'post') {
                    // Force 1 episode for Magic flow by sending explicit count to backend
                    // Keep prompt simple (Topic) so backend wrapper works correctly
                    specificPrompt = `${this.lesson.title}. ${this.lesson.subtitle || ''}. Formát: Rozhovor moderátora a experta. Délka cca 5 minut. Detailní scénář.`;
                    episodeCount = 1;
                }

                if (type === 'comic') {
                    const title = this.lesson.title;
                    // Ask for a script, NOT images yet. Images are expensive/slow, so we generate them manually later.
                    specificPrompt = `Vytvoř scénář pro 4-panelový vzdělávací komiks k tématu: ${title}. Výstup musí být POUZE validní JSON v tomto formátu: { "panels": [ { "panel_number": 1, "visual_description": "...", "dialogue": "..." }, ... ] }`;
                }

                if (type === 'flashcards') {
                    specificPrompt = `Vytvoř sadu 10 studijních kartiček (flashcards) k tématu: ${this.lesson.title}. Výstup musí být JSON: [{ "front": "Pojem", "back": "Vysvětlení" }, ...].`;
                }

                if (type === 'mindmap') {
                     specificPrompt = `Vytvoř strukturu mentální mapy k tématu: ${this.lesson.title}. Výstup musí být POUZE validní kód pro Mermaid.js (typ graph TD). Nepoužívej markdown bloky, jen čistý text diagramu.`;
                }

                // Build Prompt Data
                const promptData = {
                    userPrompt: specificPrompt,
                    slide_count: 5, // Default for magic
                    episode_count: episodeCount
                };

                const result = await callGenerateContent({ contentType: type, promptData, filePaths });

                if (result && !result.error) {
                    let dataKey = type === 'text' ? 'text_content' : type;
                    let dataValue = (type === 'text' && result.text) ? result.text : result;

                    if (type === 'comic') {
                        dataKey = 'comic_script';
                        try {
                            const jsonMatch = dataValue.match(/\{[\s\S]*\}/);
                            if (jsonMatch) {
                                dataValue = JSON.parse(jsonMatch[0]);
                            } else {
                                throw new Error("AI nevrátila validní JSON.");
                            }
                        } catch (e) {
                            console.error("Failed to parse comic script JSON:", e, dataValue);
                            // Avoid saving malformed data by skipping this type
                            continue;
                        }
                    }

                    if (type === 'flashcards') {
                        try {
                             let jsonStr = dataValue.replace(/```json/g, '').replace(/```/g, '').trim();
                             dataValue = JSON.parse(jsonStr);
                        } catch (e) {
                            console.error("Failed to parse flashcards JSON:", e, dataValue);
                            continue;
                        }
                    }

                    if (type === 'mindmap') {
                        // Cleanup mermaid code
                        dataValue = dataValue.replace(/```mermaid/g, '').replace(/```/g, '').trim();
                    }

                    // Update Local State
                    this.lesson = { ...this.lesson, [dataKey]: dataValue };

                    // CRITICAL: Autosave to Firestore immediately
                    await updateDoc(doc(firebaseInit.db, 'lessons', this.lesson.id), {
                         [dataKey]: dataValue,
                         updatedAt: serverTimestamp()
                    });

                } else {
                    console.warn(`Magic generation failed for ${type}:`, result?.error);
                }
            }

            this._magicProgress = '';
            showToast("Magie dokončena! Zkontrolujte vygenerovaný obsah.");

            // Go to Hub view
            this._viewMode = 'hub';
            this._nextStep(); // Go to content step (Step 2)

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

    _switchToEditor(typeId) {
        this._selectedContentType = typeId;
        this._viewMode = 'editor';
        this._updateUrlParams();
    }

    _openStudentPreview() {
        this._showStudentPreview = true;
    }

    _closeStudentPreview() {
        this._showStudentPreview = false;
    }

    _openRagModal(e) {
        if (e) e.preventDefault();
        const modal = document.getElementById('media-library-modal');
        const modalConfirm = document.getElementById('modal-confirm-btn');
        const modalCancel = document.getElementById('modal-cancel-btn');
        const modalClose = document.getElementById('modal-close-btn');

        if (!modal || !modalConfirm || !modalCancel || !modalClose) {
             console.error("Chybějící elementy pro modální okno.");
             showToast("Chyba: Nepodařilo se načíst komponentu pro výběr souborů.", true);
             return;
        }

        // Load current files for THIS lesson to global state
        loadSelectedFiles(this.lesson?.ragFilePaths || []);

        const handleConfirm = () => {
             // Re-render the list in the editor (Step 1)
             renderSelectedFiles('course-media-list-container');
             closeModal();
        };

        const handleCancel = () => closeModal();

        const closeModal = () => {
            modal.classList.add('hidden');
            modalConfirm.removeEventListener('click', handleConfirm);
            modalCancel.removeEventListener('click', handleCancel);
            modalClose.removeEventListener('click', handleCancel);
        };

        // Render library files
        renderMediaLibraryFiles('main-course', 'modal-media-list');

        modalConfirm.addEventListener('click', handleConfirm);
        modalCancel.addEventListener('click', handleCancel);
        modalClose.addEventListener('click', handleCancel);

        modal.classList.remove('hidden');
    }

    renderEditorContent(typeId) {
        switch(typeId) {
            case 'text': return html`<editor-view-text .lesson=${this.lesson} @lesson-updated=${this._handleLessonUpdate}></editor-view-text>`;
            case 'presentation': return html`<editor-view-presentation .lesson=${this.lesson} @lesson-updated=${this._handleLessonUpdate}></editor-view-presentation>`;
            case 'video': return html`<editor-view-video .lesson=${this.lesson} @lesson-updated=${this._handleLessonUpdate}></editor-view-video>`;
            case 'quiz': return html`<editor-view-quiz .lesson=${this.lesson} @lesson-updated=${this._handleLessonUpdate}></editor-view-quiz>`;
            case 'test': return html`<editor-view-test .lesson=${this.lesson} @lesson-updated=${this._handleLessonUpdate}></editor-view-test>`;
            case 'post': return html`<editor-view-post .lesson=${this.lesson} @lesson-updated=${this._handleLessonUpdate}></editor-view-post>`;
            case 'comic': return html`<editor-view-comic .lesson=${this.lesson} @lesson-updated=${this._handleLessonUpdate}></editor-view-comic>`;
            case 'flashcards': return html`<editor-view-flashcards .lesson=${this.lesson} @lesson-updated=${this._handleLessonUpdate}></editor-view-flashcards>`;
            case 'mindmap': return html`<editor-view-mindmap .lesson=${this.lesson} @lesson-updated=${this._handleLessonUpdate}></editor-view-mindmap>`;
            default: return html`<p class="text-red-500">Neznámý typ obsahu</p>`;
        }
    }

    render() {
        return html`
            <div class="h-full bg-white overflow-y-auto">
                <!-- Zen Mode Container -->
                <div class="max-w-6xl mx-auto px-6 py-12 flex flex-col h-full">

                    <!-- Simple Header -->
                    <header class="flex items-center justify-between mb-8">
                        <button @click=${this._handleBackClick} class="group flex items-center text-sm font-medium text-slate-400 hover:text-slate-900 transition-colors">
                            <div class="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center mr-2 group-hover:bg-slate-100 transition-colors">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                            </div>
                            Zavřít
                        </button>
                        ${this.lesson?.id ? html`<span class="text-xs font-mono text-slate-300 uppercase tracking-widest">ID: ${this.lesson.id.substring(0,6)}</span>` : ''}
                    </header>

                    <div class="flex-grow relative">

                        <!-- === SETTINGS VIEW (Old Step 1) === -->
                        <div class="${this._viewMode === 'settings' ? 'block' : 'hidden'} animate-fade-in space-y-8 max-w-3xl mx-auto">
                             <h2 class="text-3xl font-bold text-slate-900">Nastavení Lekce</h2>

                             <!-- INLINED SETTINGS FORM WITH FLOATING LABELS -->
                             <div class="space-y-6 bg-white p-1 rounded-2xl">
                                <div class="relative">
                                    <input type="text" id="lesson-title-input"
                                        class="block px-2.5 pb-2.5 pt-4 w-full text-4xl font-extrabold text-slate-900 bg-transparent border-0 border-b-2 border-slate-200 appearance-none focus:outline-none focus:ring-0 focus:border-indigo-600 peer transition-colors"
                                        placeholder=" "
                                        .value="${this.lesson?.title || ''}" />
                                    <label for="lesson-title-input"
                                        class="absolute text-sm text-slate-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-2 peer-focus:px-2 peer-focus:text-indigo-600 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 left-1">
                                        Název lekce
                                    </label>
                                </div>

                                <div class="relative mt-4">
                                    <input type="text" id="lesson-subtitle-input"
                                        class="block px-2.5 pb-2.5 pt-4 w-full text-xl text-slate-600 bg-transparent border-0 border-b-2 border-slate-200 appearance-none focus:outline-none focus:ring-0 focus:border-indigo-600 peer transition-colors"
                                        placeholder=" "
                                        .value="${this.lesson?.subtitle || ''}" />
                                    <label for="lesson-subtitle-input"
                                        class="absolute text-sm text-slate-400 duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-white px-2 peer-focus:px-2 peer-focus:text-indigo-600 peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 left-1">
                                        Podtitulek / Téma
                                    </label>
                                    <p class="text-xs text-slate-400 mt-1 pl-3">💡 Tip: Krátký popis tématu pomůže AI lépe zaměřit generovaný obsah.</p>
                                </div>

                                <div class="pt-4">
                                    <label class="block font-medium text-slate-600 mb-2">Přiřadit do tříd:</label>
                                    <div class="space-y-2 border rounded-lg p-3 bg-slate-50 max-h-40 overflow-y-auto">
                                        ${this._groups.length > 0 ? this._groups.map(group => html`
                                            <div class="flex items-center">
                                                <input type="checkbox"
                                                    id="group-${group.id}"
                                                    name="group-assignment"
                                                    value="${group.id}"
                                                    .checked=${this.lesson?.assignedToGroups?.includes(group.id) || false}
                                                    class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                                                <label for="group-${group.id}" class="ml-3 text-sm text-gray-700">${group.name}</label>
                                            </div>
                                        `) : html`
                                            <p class="text-xs text-slate-500">Zatím nemáte vytvořené žádné třídy.</p>
                                        `}
                                    </div>
                                </div>
                             </div>

                            <!-- File Upload Zone -->
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
                                <button @click=${this._openRagModal} class="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium shadow-sm hover:text-indigo-600 hover:border-indigo-200 hover:bg-slate-50 transition-all ml-4">
                                    📂 Vybrat z knihovny
                                </button>

                                <div id="upload-progress-container" class="hidden mt-4 max-w-md mx-auto"></div>
                                <ul id="course-media-list-container" class="mt-4 text-left max-w-md mx-auto space-y-2"></ul>
                            </div>

                            <!-- Action Buttons -->
                            <div class="flex flex-col sm:flex-row gap-4 justify-center pt-8">
                                <button @click=${this._handleMagicGeneration} ?disabled=${this._isLoading}
                                    class="flex-1 py-4 px-6 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold shadow-xl shadow-indigo-200 hover:shadow-indigo-300 hover:-translate-y-1 transition-all flex items-center justify-center text-lg">
                                    ${this._isLoading ? html`<span class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-3"></span> ${this._magicProgress}` : html`<span class="mr-2">✨</span> Magicky Vygenerovat Vše`}
                                </button>

                                <button @click=${this._switchToHub} ?disabled=${this._isLoading}
                                    class="flex-1 py-4 px-6 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 hover:text-slate-900 transition-all flex items-center justify-center text-lg">
                                    Pokračovat na obsah <span class="ml-2">→</span>
                                </button>
                            </div>
                        </div>

                        <!-- === HUB VIEW (New Main Menu) === -->
                        <div class="${this._viewMode === 'hub' ? 'block' : 'hidden'} animate-fade-in flex flex-col h-full">

                            <!-- Hub Header -->
                            <div class="text-center mb-10 relative">
                                <h1 class="text-3xl font-bold text-slate-900 mb-2">${this.lesson?.title || 'Nová lekce'}</h1>
                                <button @click=${this._switchToSettings} class="text-sm font-bold text-slate-400 hover:text-indigo-600 flex items-center justify-center mx-auto mb-4">
                                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                    Upravit detaily a soubory
                                </button>

                                <button @click=${this._openStudentPreview} class="inline-flex items-center px-4 py-2 bg-indigo-50 text-indigo-700 rounded-full text-sm font-bold hover:bg-indigo-100 transition-colors shadow-sm border border-indigo-100">
                                    👁️ Náhled studenta
                                </button>
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto w-full">
                                ${this.contentTypes.map(type => {
                                    // Check if content exists
                                    const hasContent = this.lesson && ((type.id === 'text' && this.lesson.text_content) || (type.id !== 'text' && this.lesson[type.id]));

                                    return html`
                                        <div @click=${() => this._switchToEditor(type.id)}
                                             class="group cursor-pointer bg-white rounded-3xl border border-slate-100 p-8 transition-all duration-300 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-100/50 hover:-translate-y-1 relative overflow-hidden flex flex-col items-center justify-center min-h-[220px]">

                                            <div class="absolute top-0 right-0 p-5 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                                                <svg class="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
                                            </div>

                                            <div class="w-20 h-20 rounded-2xl bg-slate-50 flex items-center justify-center text-4xl shadow-sm mb-6 group-hover:scale-110 transition-transform duration-300 group-hover:bg-indigo-50">
                                                ${type.icon}
                                            </div>

                                            <div class="text-center">
                                                <h3 class="font-bold text-slate-900 text-xl group-hover:text-indigo-700 transition-colors mb-1">${type.label}</h3>
                                                <p class="text-xs text-slate-400 font-medium">${type.description}</p>
                                            </div>

                                            <div class="absolute bottom-6 left-1/2 transform -translate-x-1/2">
                                                ${hasContent ? html`
                                                    <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
                                                        <span class="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5"></span>
                                                        Hotovo
                                                    </span>
                                                ` : html`
                                                    <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-400 border border-slate-200">
                                                        <span class="w-1.5 h-1.5 bg-slate-300 rounded-full mr-1.5"></span>
                                                        Prázdné
                                                    </span>
                                                `}
                                            </div>
                                        </div>
                                    `;
                                })}
                            </div>

                            <div class="mt-16 flex justify-center pb-8">
                                <button @click=${this._handleSaveLesson}
                                    class="group relative inline-flex items-center justify-center px-10 py-5 text-lg font-bold text-white transition-all duration-200 bg-indigo-600 rounded-full hover:bg-indigo-700 shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-1">
                                    🚀 Publikovat a Zavřít
                                    <svg class="w-5 h-5 ml-2 -mr-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                                </button>
                            </div>
                        </div>

                        <!-- === EDITOR VIEW === -->
                        <div class="${this._viewMode === 'editor' ? 'block' : 'hidden'} h-full animate-fade-in flex flex-col">
                            <div class="mb-6 flex items-center justify-between max-w-5xl mx-auto w-full">
                                <button @click=${this._switchToHub} class="flex items-center text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors px-4 py-3 rounded-xl bg-slate-50 hover:bg-indigo-50">
                                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                                    Zpět na přehled
                                </button>
                                <h3 class="font-bold text-slate-800 text-lg flex items-center">
                                    <span class="mr-2 text-2xl">${this.contentTypes.find(t => t.id === this._selectedContentType)?.icon}</span>
                                    ${this.contentTypes.find(t => t.id === this._selectedContentType)?.label}
                                </h3>
                            </div>

                            <!-- Active Editor Content -->
                            <div id="active-editor-content" class="flex-grow bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 p-1 overflow-hidden max-w-5xl mx-auto w-full">
                                <div class="h-full overflow-y-auto custom-scrollbar">
                                     ${this.renderEditorContent(this._selectedContentType)}
                                </div>
                            </div>

                            <!-- Footer inside Editor -->
                            <div class="mt-6 flex justify-end max-w-5xl mx-auto w-full pb-8">
                                <button @click=${() => {
                                    this.renderRoot.querySelector('editor-view-' + this._selectedContentType)?.save();
                                    showToast("Sekce uložena");
                                }}
                                    class="text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-6 py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 flex items-center">
                                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                                    Uložit změny
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- STUDENT PREVIEW MODAL -->
                ${this._showStudentPreview ? html`
                    <div class="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
                        <div class="relative w-full h-full max-w-sm max-h-[85vh] flex flex-col">
                             <button @click=${this._closeStudentPreview} class="absolute -top-12 right-0 text-white hover:text-slate-200 font-bold flex items-center">
                                Zavřít náhled <span class="text-2xl ml-2">×</span>
                            </button>

                            <!-- Mobile Frame -->
                            <div class="w-full h-full bg-white border-8 border-slate-900 rounded-[3rem] overflow-hidden shadow-2xl relative flex flex-col">
                                <!-- Mobile Status Bar Simulation -->
                                <div class="h-7 bg-slate-900 w-full flex justify-between items-center px-6">
                                    <span class="text-[10px] text-white font-mono">9:41</span>
                                    <div class="flex space-x-1">
                                        <div class="w-3 h-3 bg-slate-800 rounded-full"></div>
                                        <div class="w-3 h-3 bg-slate-800 rounded-full"></div>
                                    </div>
                                </div>

                                <!-- Content -->
                                <div class="flex-grow overflow-y-auto bg-slate-50 custom-scrollbar">
                                    <student-lesson-detail
                                        .lessonData=${this.lesson}>
                                    </student-lesson-detail>
                                </div>

                                <!-- Mobile Home Indicator -->
                                <div class="h-1 bg-slate-900 w-full flex justify-center items-end pb-2">
                                     <div class="w-1/3 h-1 bg-slate-200 rounded-full opacity-20"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                ` : ''}

            </div>
            <style>
                /* Custom Animations for Zen Feel */
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
                .animate-pulse-slow { animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #e2e8f0; border-radius: 20px; }

            </style>
        `;
    }
}
customElements.define('lesson-editor', LessonEditor);
