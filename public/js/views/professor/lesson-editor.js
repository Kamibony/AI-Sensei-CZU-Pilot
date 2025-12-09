import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { BaseView } from './base-view.js';
import { doc, getDoc, updateDoc, setDoc, arrayUnion, arrayRemove, collection, getDocs, where, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, auth, functions } from '../../firebase-init.js';
import { showToast } from '../../utils.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { translationService } from '../../services/translation-service.js';

import './editor/editor-view-text.js';
import './editor/editor-view-presentation.js';
import './editor/editor-view-quiz.js';
import './editor/editor-view-test.js';
import './editor/editor-view-post.js';
import './editor/editor-view-ai.js';
import './editor/editor-view-video.js';
import './editor/editor-view-comic.js';
import './editor/editor-view-flashcards.js';
import './editor/editor-view-mindmap.js';
import './editor/ai-generator-panel.js';

// Import from utils (upload logic)
import { processFileForRAG, uploadMultipleFiles, uploadSingleFile } from '../../utils/upload-handler.js';
// Import from global handler (media library modal logic)
import { renderMediaLibraryFiles, getSelectedFiles, clearSelectedFiles } from '../../upload-handler.js';

export class LessonEditor extends BaseView {
  static properties = {
    lesson: { type: Object },
    isSaving: { type: Boolean },
    _selectedClassIds: { state: true, type: Array },
    _availableClasses: { state: true, type: Array },
    _showDeleteConfirm: { state: true, type: Boolean },
    _uploading: { state: true },
    _processingRAG: { state: true },
    _uploadedFiles: { state: true, type: Array } // Source of truth for files
  };

  constructor() {
    super();
    this.lesson = null;
    this.isSaving = false;
    this._selectedClassIds = [];
    this._availableClasses = [];
    this._showDeleteConfirm = false;
    this._uploading = false;
    this._processingRAG = false;
    this._uploadedFiles = [];
    this._unsubscribe = null;
  }

  updated(changedProperties) {
    if (changedProperties.has('lesson')) {
      if (this.lesson) {
        this._selectedClassIds = this.lesson.assignedToGroups || [];
        // Ensure we load files from lesson, defaulting to empty array
        this._uploadedFiles = this.lesson.files || [];
      } else {
        this._selectedClassIds = [];
        this._uploadedFiles = [];
        this._initNewLesson();
      }
    }
  }

  async connectedCallback() {
      super.connectedCallback();
      this._unsubscribe = translationService.subscribe(() => this.requestUpdate());
      await this._fetchAvailableClasses();

      if (!this.lesson) {
          this._initNewLesson();
      }
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      if (this._unsubscribe) this._unsubscribe();
  }

  _initNewLesson() {
      this.lesson = {
          title: '',
          topic: '',
          contentType: 'text',
          content: { blocks: [] },
          assignedToGroups: [],
          status: 'draft',
          files: [],
          createdAt: new Date().toISOString()
      };
      this.requestUpdate();
  }

  async _fetchAvailableClasses() {
      try {
          const user = auth.currentUser;
          if (!user) return;

          const q = query(collection(db, 'groups'), where('ownerId', '==', user.uid));
          const querySnapshot = await getDocs(q);
          this._availableClasses = querySnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
          }));
      } catch (error) {
          console.error("Error fetching classes:", error);
          showToast(translationService.t('professor.error_create_class'), true);
      }
  }

  async _handleSave() {
    if (!this.lesson.title) {
      // Don't toast on auto-save if title is missing, just return
      // But if triggered manually?
      // For now, we allow saving without title for "auto-save" but maybe not validation?
      // User said "IMMEDIATELY save this.lesson to Firestore" when file uploaded.
      // If title is missing, we might create a draft with "Untitled".
      // Let's stick to requiring title for now to avoid bad data, but maybe relaxed for files?
      // Actually, if I upload a file, I want it saved.
      if (!this.lesson.title) this.lesson.title = "Nová lekce";
    }

    this.isSaving = true;
    try {
      const user = auth.currentUser;
      if (!user) throw new Error(translationService.t('media.login_required'));

      const lessonData = {
        ...this.lesson,
        assignedToGroups: this._selectedClassIds,
        files: this._uploadedFiles, // Save current files state
        updatedAt: new Date().toISOString(),
        ownerId: user.uid
      };

      if (!lessonData.id) {
          lessonData.createdAt = new Date().toISOString();
          const newDocRef = doc(collection(db, 'lessons'));
          lessonData.id = newDocRef.id;
          await setDoc(newDocRef, lessonData);
          this.lesson = lessonData;
          showToast(translationService.t('common.saved'));

          this.dispatchEvent(new CustomEvent('lesson-updated', {
              detail: this.lesson,
              bubbles: true,
              composed: true
          }));

      } else {
          const lessonRef = doc(db, 'lessons', this.lesson.id);
          await updateDoc(lessonRef, lessonData);
          showToast(translationService.t('common.saved'));
          this.dispatchEvent(new CustomEvent('lesson-updated', {
              detail: this.lesson,
              bubbles: true,
              composed: true
          }));
      }

    } catch (error) {
      console.error('Error saving lesson:', error);
      showToast(translationService.t('common.error'), true);
    } finally {
      this.isSaving = false;
    }
  }

  _handleBackClick() {
      // Always return to timeline/library
      this.dispatchEvent(new CustomEvent('editor-exit', {
          detail: { view: 'timeline' },
          bubbles: true,
          composed: true
      }));
  }

  _handleClassToggle(classId) {
      if (this._selectedClassIds.includes(classId)) {
          this._selectedClassIds = this._selectedClassIds.filter(id => id !== classId);
      } else {
          this._selectedClassIds = [...this._selectedClassIds, classId];
      }
      this.requestUpdate(); // Trigger update
      // Logic requirement: "IMMEDIATELY save" was for files, but good UX is to save assignments too?
      // User didn't specify for classes, but let's do it for consistency if title exists.
      if(this.lesson.title) this._handleSave();
  }

  async _handleFilesSelected(e) {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      this._uploading = true;
      try {
          const user = auth.currentUser;
          if (!user) throw new Error(translationService.t('media.login_required'));

          const courseId = this._selectedClassIds.length > 0 ? this._selectedClassIds[0] : 'main-course';

          const uploadResult = await uploadMultipleFiles(files, courseId, (progress) => {
              console.log('Upload progress:', progress);
          });

          const newFiles = uploadResult.successful.map(f => ({
              id: f.fileId,
              name: f.fileName,
              url: f.url,
              storagePath: f.storagePath,
              uploadedAt: new Date().toISOString()
          }));

          // IMMEDIATELY update state
          this._uploadedFiles = [...this._uploadedFiles, ...newFiles];

          // IMMEDIATELY save
          await this._handleSave();

          // Process RAG
          this._processingRAG = true;
          for (const file of newFiles) {
              if (file.name.toLowerCase().endsWith('.pdf') || file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.docx')) {
                  try {
                       await processFileForRAG(file.id);
                       showToast(`${translationService.t('common.success')}: ${file.name}`);
                  } catch (err) {
                      console.error("RAG processing failed for", file.name, err);
                      showToast(`${translationService.t('lesson.upload_ai_failed_specific', { filename: file.name })}`, true);
                  }
              }
          }

      } catch (error) {
          console.error("Upload error:", error);
          showToast(translationService.t('lesson.upload_error'), true);
      } finally {
          this._uploading = false;
          this._processingRAG = false;
          e.target.value = '';
      }
  }

  async _handleDeleteFile(fileIndex) {
      // Remove from state
      this._uploadedFiles.splice(fileIndex, 1);
      this._uploadedFiles = [...this._uploadedFiles]; // Trigger reactivity
      // Save immediately
      await this._handleSave();
  }

  _handleOpenLibrary() {
      const modal = document.getElementById('media-library-modal');
      if (!modal) {
          console.error("Media library modal not found in DOM");
          return;
      }

      // Use 'main-course' or first selected class
      const courseId = this._selectedClassIds.length > 0 ? this._selectedClassIds[0] : 'main-course';

      // Clear previous global selection to avoid ghost files
      clearSelectedFiles();

      // Render files in the modal
      renderMediaLibraryFiles(courseId, "modal-media-list");
      modal.classList.remove('hidden');

      const close = () => { modal.classList.add('hidden'); cleanup(); };

      const confirm = async () => {
          // Get files selected in the modal (global state)
          const selected = getSelectedFiles();

          if (selected.length > 0) {
               // Map to our file structure.
               // getSelectedFiles returns { name, fullPath, id (maybe) }
               // We need { id, name, url, storagePath }
               // The global handler might not return everything we need (like URL or ID if it's just path).
               // But renderMediaLibraryFiles uses Firestore fileMetadata, so it should have IDs.
               // Let's check upload-handler.js: "return { name: data.fileName, fullPath: data.storagePath, id: doc.id };"

               const newFiles = selected.map(f => ({
                   id: f.id || 'unknown', // Fallback
                   name: f.name,
                   url: '', // We might not have URL, but AI doesn't need it. View might need it?
                            // If we need URL, we might need to fetch it or just use storagePath.
                   storagePath: f.fullPath,
                   uploadedAt: new Date().toISOString()
               }));

               // Add only unique files
               const currentPaths = this._uploadedFiles.map(f => f.storagePath);
               const uniqueNewFiles = newFiles.filter(f => !currentPaths.includes(f.storagePath));

               if (uniqueNewFiles.length > 0) {
                   this._uploadedFiles = [...this._uploadedFiles, ...uniqueNewFiles];
                   await this._handleSave();
                   showToast(`Pridáno ${uniqueNewFiles.length} souborů z knihovny.`);
               }
          }
          close();
      };

      const cleanup = () => {
           document.getElementById('modal-confirm-btn')?.removeEventListener('click', confirm);
           document.getElementById('modal-cancel-btn')?.removeEventListener('click', close);
           document.getElementById('modal-close-btn')?.removeEventListener('click', close);
      }

      // Remove old listeners (defensive)
      const confirmBtn = document.getElementById('modal-confirm-btn');
      if(confirmBtn) {
          const newBtn = confirmBtn.cloneNode(true);
          confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
          newBtn.addEventListener('click', confirm);
      }

      const cancelBtn = document.getElementById('modal-cancel-btn');
      if(cancelBtn) {
          cancelBtn.addEventListener('click', close);
      }
      const closeBtn = document.getElementById('modal-close-btn');
      if(closeBtn) {
          closeBtn.addEventListener('click', close);
      }
  }

  _handleMagicGeneration(e) {
      const { prompt } = e.detail;
      const filePaths = this._uploadedFiles.map(f => f.storagePath).filter(Boolean);

      const generationParams = {
          prompt: prompt,
          contentType: this.lesson.contentType,
          filePaths: filePaths
      };

      if (this.lesson.contentType === 'audio') {
          generationParams.episode_count = 3;
      }

      const activeEditor = this.shadowRoot.querySelector('#active-editor');
      if (activeEditor && activeEditor.handleAiGeneration) {
          activeEditor.handleAiGeneration(generationParams);
      } else {
          console.warn("No active editor to handle generation");
      }
  }

  _renderHeader() {
    return html`
      <div class="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex flex-col md:flex-row justify-between items-center py-6 gap-4">

            <div class="flex items-center gap-4 w-full">
              <button @click="${this._handleBackClick}"
                      class="p-2 -ml-2 text-slate-400 hover:text-indigo-600 hover:bg-white/50 rounded-xl transition-all"
                      title="${translationService.t('professor.editor.back')}">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                </svg>
              </button>

              <div class="flex-1">
                  <input type="text"
                         .value="${this.lesson.title}"
                         @input="${e => this.lesson = { ...this.lesson, title: e.target.value }}"
                         class="w-full bg-transparent border-none p-0 text-4xl font-extrabold text-slate-800 placeholder-slate-300 focus:ring-0 focus:outline-none"
                         placeholder="${translationService.t('professor.editor.lessonTitlePlaceholder')}">

                  <div class="flex items-center gap-3 mt-2">
                       <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${this.lesson.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'}">
                            ${this.lesson.status === 'active' ? 'Aktivní' : 'Koncept'}
                       </span>
                       <span class="text-xs text-slate-400">
                           ${this.isSaving ? translationService.t('common.saving') : (this.lesson.updatedAt ? `Uloženo ${new Date(this.lesson.updatedAt).toLocaleTimeString()}` : '')}
                       </span>
                  </div>
              </div>
            </div>

            <div class="flex items-center gap-3 flex-shrink-0">
               <button @click="${this._handleSave}"
                      class="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-full shadow-lg text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 focus:outline-none transform hover:-translate-y-0.5 transition-all ${this.isSaving ? 'opacity-75 cursor-wait' : ''}"
                      ?disabled="${this.isSaving}">
                ${this.isSaving ? html`
                  <svg class="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  ${translationService.t('common.saving')}
                ` : html`
                  ${translationService.t('professor.editor.saveChanges')}
                `}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderEditorContent() {
      // Content Type Selector logic moved to header or sidebar? No, requested to stay or just "Hero Section".
      // The previous "Hero" had contentType selector.
      // The new "Hero" is the header.
      // Where does Content Type go?
      // I will put it in the "Resource Grid" area or above it?
      // The user didn't specify, but implied a "Hero Section (Top)" then "Resource Grid (Middle)".
      // Content Type is critical. I'll add it to the top of the body or side of the grid.

      // Let's keep a small settings bar above the grid for Topic and Content Type.
      return html`
         <div class="mb-6 grid grid-cols-1 md:grid-cols-3 gap-6">
             <div class="md:col-span-2">
                <label class="block text-sm font-medium text-slate-700 mb-1">${translationService.t('professor.editor.subtitle')}</label>
                <input type="text"
                       .value="${this.lesson.topic}"
                       @input="${e => this.lesson = { ...this.lesson, topic: e.target.value }}"
                       class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow shadow-sm"
                       placeholder="${translationService.t('professor.editor.subtitlePlaceholder')}">
             </div>
             <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">${translationService.t('lesson.subtitle')}</label>
                <select .value="${this.lesson.contentType}"
                        @change="${e => this.lesson = { ...this.lesson, contentType: e.target.value }}"
                        class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm">
                    <option value="text">${translationService.t('content_types.text')}</option>
                    <option value="presentation">${translationService.t('content_types.presentation')}</option>
                    <option value="quiz">${translationService.t('content_types.quiz')}</option>
                    <option value="test">${translationService.t('content_types.test')}</option>
                    <option value="post">Příspěvek (Feed)</option>
                    <option value="video">${translationService.t('content_types.video')}</option>
                    <option value="audio">${translationService.t('content_types.audio')}</option>
                    <option value="comic">${translationService.t('content_types.comic')}</option>
                    <option value="flashcards">${translationService.t('content_types.flashcards')}</option>
                    <option value="mindmap">${translationService.t('content_types.mindmap')}</option>
                </select>
             </div>
         </div>

         <!-- Active Editor Component -->
         <div class="bg-white rounded-3xl shadow-lg border border-slate-100 overflow-hidden min-h-[500px] flex flex-col relative">
             ${this._renderSpecificEditor()}
         </div>
      `;
  }

  _renderSpecificEditor() {
      switch (this.lesson.contentType) {
          case 'text': return html`<editor-view-text id="active-editor" .lesson=${this.lesson} @update=${e => { this.lesson = { ...this.lesson, content: e.detail }; }}></editor-view-text>`;
          case 'presentation': return html`<editor-view-presentation id="active-editor" .lesson=${this.lesson} @update=${e => { this.lesson = { ...this.lesson, slides: e.detail }; }}></editor-view-presentation>`;
          case 'quiz': return html`<editor-view-quiz id="active-editor" .lesson=${this.lesson} @update=${e => { this.lesson = { ...this.lesson, questions: e.detail }; }}></editor-view-quiz>`;
          case 'test': return html`<editor-view-test id="active-editor" .lesson=${this.lesson} @update=${e => { this.lesson = { ...this.lesson, questions: e.detail }; }}></editor-view-test>`;
          case 'post': return html`<editor-view-post id="active-editor" .lesson=${this.lesson} @update=${e => { this.lesson = { ...this.lesson, ...e.detail }; }}></editor-view-post>`;
          case 'audio': return html`<div class="p-12 text-center text-slate-500 bg-slate-50 flex flex-col items-center justify-center h-full">
              <span class="text-4xl mb-4">🎙️</span>
              <p>Editor pro Podcasty</p>
              <p class="text-sm mt-2">Nakonfigurujte a vygenerujte obsah pomocí AI Panelu níže.</p>
          </div>`;
          default: return html`<div class="p-4 text-center text-red-500">${translationService.t('common.unknown_type')}</div>`;
      }
  }

  render() {
    return html`
      <div class="h-full flex flex-col bg-slate-50/50 relative">
        ${this._renderHeader()}

        <div class="flex-1 overflow-hidden relative">
          <div class="absolute inset-0 overflow-y-auto custom-scrollbar">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

              <!-- Resource Grid (Middle) -->
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">

                 <!-- Left: Classes (Assignment) -->
                 <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 flex flex-col h-full hover:shadow-md transition-shadow">
                    <div class="flex items-center gap-3 mb-6 border-b border-slate-50 pb-4">
                        <div class="p-2.5 bg-indigo-50 rounded-xl">
                            <span class="text-2xl">👥</span>
                        </div>
                        <div>
                            <h3 class="text-xl font-bold text-slate-800">Kdo to uvidí?</h3>
                            <p class="text-sm text-slate-400">Přiřazení třídám</p>
                        </div>
                    </div>

                    ${this._availableClasses.length === 0 ? html`
                        <div class="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            <p>${translationService.t('professor.no_classes_yet')}</p>
                        </div>
                    ` : html`
                        <div class="flex-1 space-y-3">
                            ${this._availableClasses.map(group => html`
                                <label class="flex items-center justify-between p-4 rounded-2xl border ${this._selectedClassIds.includes(group.id) ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-100 hover:bg-slate-50'} cursor-pointer transition-all">
                                    <span class="font-bold text-slate-700">${group.name}</span>
                                    <div class="relative inline-block w-12 mr-2 align-middle select-none transition duration-200 ease-in">
                                        <input type="checkbox"
                                               .checked="${this._selectedClassIds.includes(group.id)}"
                                               @change="${() => this._handleClassToggle(group.id)}"
                                               class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer outline-none transition-transform duration-200 ease-in-out ${this._selectedClassIds.includes(group.id) ? 'translate-x-6 border-indigo-500' : 'border-slate-300'}"/>
                                        <div class="toggle-label block overflow-hidden h-6 rounded-full bg-slate-200 cursor-pointer ${this._selectedClassIds.includes(group.id) ? 'bg-indigo-200' : ''}"></div>
                                    </div>
                                </label>
                            `)}
                        </div>
                    `}
                 </div>

                 <!-- Right: Files (Context) -->
                 <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 flex flex-col h-full hover:shadow-md transition-shadow">
                    <div class="flex items-center justify-between gap-3 mb-6 border-b border-slate-50 pb-4">
                        <div class="flex items-center gap-3">
                            <div class="p-2.5 bg-indigo-50 rounded-xl">
                                <span class="text-2xl">📚</span>
                            </div>
                            <div>
                                <h3 class="text-xl font-bold text-slate-800">Podklady</h3>
                                <p class="text-sm text-slate-400">Kontext pro AI</p>
                            </div>
                        </div>

                        <div class="flex gap-2">
                             <button @click="${this._handleOpenLibrary}"
                                     class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors flex items-center gap-2">
                                <span>📂</span> Z Knihovny
                             </button>

                             <div class="relative">
                                <input type="file" multiple accept=".pdf,.docx,.txt"
                                       class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                       @change="${this._handleFilesSelected}"
                                       ?disabled="${this._uploading}">
                                <button class="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-semibold rounded-xl transition-colors flex items-center gap-2">
                                    <span>📤</span> Nahrát
                                </button>
                             </div>
                        </div>
                    </div>

                    <div class="flex-1">
                        ${this._uploadedFiles.length === 0 ? html`
                            <div class="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                <span class="text-4xl opacity-20 mb-2">📄</span>
                                <p class="text-sm">${translationService.t('common.no_files_selected')}</p>
                            </div>
                        ` : html`
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                ${this._uploadedFiles.map((file, index) => html`
                                    <div class="flex items-center p-3 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group relative">
                                        <div class="p-2 bg-red-50 rounded-lg mr-3">
                                            <span class="text-red-500 text-xl">PDF</span>
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <p class="text-sm font-bold text-slate-700 truncate" title="${file.name}">${file.name}</p>
                                            <p class="text-xs text-slate-400">Připojeno</p>
                                        </div>
                                        <button @click="${() => this._handleDeleteFile(index)}"
                                                class="absolute -top-2 -right-2 bg-white text-slate-400 hover:text-red-500 rounded-full p-1 border border-slate-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                            </svg>
                                        </button>
                                    </div>
                                `)}
                            </div>
                        `}
                    </div>
                 </div>

              </div>

              <!-- AI Generator Panel (Passing Files) -->
              <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
                 <ai-generator-panel
                    .lesson=${this.lesson}
                    .files=${this._uploadedFiles}
                    @generate="${this._handleMagicGeneration}">
                 </ai-generator-panel>
              </div>

              ${this._renderEditorContent()}

            </div>
          </div>
        </div>
      </div>
    `;
  }
}
customElements.define('lesson-editor', LessonEditor);
