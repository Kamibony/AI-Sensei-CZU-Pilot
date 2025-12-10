
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
    _availableSubjects: { state: true, type: Array },
    _showDeleteConfirm: { state: true, type: Boolean },
    _uploading: { state: true },
    _processingRAG: { state: true },
    _uploadedFiles: { state: true, type: Array }, // Source of truth for files
    _wizardMode: { state: true, type: Boolean } // 'wizard' (settings) or 'editor'
  };

  constructor() {
    super();
    this.lesson = null;
    this.isSaving = false;
    this._selectedClassIds = [];
    this._availableClasses = [];
    this._availableSubjects = [];
    this._showDeleteConfirm = false;
    this._uploading = false;
    this._processingRAG = false;
    this._uploadedFiles = [];
    this._unsubscribe = null;
    this._wizardMode = true;
  }

  updated(changedProperties) {
    if (changedProperties.has('lesson')) {
      if (this.lesson) {
        this._selectedClassIds = this.lesson.assignedToGroups || [];
        // Ensure we load files from lesson, defaulting to empty array
        this._uploadedFiles = this.lesson.files || [];

        // Decide view mode based on lesson state
        // If content is empty/new and no ID, show wizard.
        if (this.lesson.id) {
             this._wizardMode = false;
        } else {
             this._wizardMode = true;
        }
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
      await Promise.all([
          this._fetchAvailableClasses(),
          this._fetchAvailableSubjects()
      ]);

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
          subject: '', // New field
          topic: '',
          contentType: 'text',
          content: { blocks: [] },
          assignedToGroups: [],
          status: 'draft',
          files: [],
          createdAt: new Date().toISOString()
      };
      this._wizardMode = true;
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

  async _fetchAvailableSubjects() {
      try {
          const user = auth.currentUser;
          if (!user) return;

          const q = query(collection(db, 'lessons'), where('ownerId', '==', user.uid));
          const querySnapshot = await getDocs(q);
          const subjects = new Set();
          querySnapshot.docs.forEach(doc => {
              const data = doc.data();
              if (data.subject) subjects.add(data.subject);
          });
          this._availableSubjects = Array.from(subjects).sort();
      } catch (e) {
          console.error("Error fetching subjects", e);
      }
  }

  async _handleSave() {
    if (!this.lesson.title) {
        if (this._wizardMode) return;
        this.lesson.title = translationService.t('lesson.new');
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
      // If in wizard mode, just go back to library.
      // If in editor mode, go back to library/timeline.
      this.dispatchEvent(new CustomEvent('editor-exit', {
          detail: { view: 'library' }, // Default to library
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
      this.requestUpdate();
      if(this.lesson.title && !this._wizardMode) this._handleSave();
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

          this._uploadedFiles = [...this._uploadedFiles, ...newFiles];
          if(this.lesson.title && !this._wizardMode) await this._handleSave();

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
      this._uploadedFiles.splice(fileIndex, 1);
      this._uploadedFiles = [...this._uploadedFiles];
      if(this.lesson.title && !this._wizardMode) await this._handleSave();
  }

  _handleOpenLibrary() {
      const modal = document.getElementById('media-library-modal');
      if (!modal) {
          console.error("Media library modal not found in DOM");
          return;
      }
      const courseId = this._selectedClassIds.length > 0 ? this._selectedClassIds[0] : 'main-course';
      clearSelectedFiles();
      renderMediaLibraryFiles(courseId, "modal-media-list");
      modal.classList.remove('hidden');

      const close = () => { modal.classList.add('hidden'); cleanup(); };

      const confirm = async () => {
          const selected = getSelectedFiles();
          if (selected.length > 0) {
               const newFiles = selected.map(f => ({
                   id: f.id || 'unknown',
                   name: f.name,
                   url: '',
                   storagePath: f.fullPath,
                   uploadedAt: new Date().toISOString()
               }));

               const currentPaths = this._uploadedFiles.map(f => f.storagePath);
               const uniqueNewFiles = newFiles.filter(f => !currentPaths.includes(f.storagePath));

               if (uniqueNewFiles.length > 0) {
                   this._uploadedFiles = [...this._uploadedFiles, ...uniqueNewFiles];
                   if(this.lesson.title && !this._wizardMode) await this._handleSave();
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

      const confirmBtn = document.getElementById('modal-confirm-btn');
      if(confirmBtn) {
          const newBtn = confirmBtn.cloneNode(true);
          confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
          newBtn.addEventListener('click', confirm);
      }
      const cancelBtn = document.getElementById('modal-cancel-btn');
      if(cancelBtn) cancelBtn.addEventListener('click', close);
      const closeBtn = document.getElementById('modal-close-btn');
      if(closeBtn) closeBtn.addEventListener('click', close);
  }

  async _handleAutoMagic() {
      if (!this.lesson.title) {
          showToast(translationService.t('professor.editor.title_required'), true);
          return;
      }

      await this._handleSave();

      const prompt = `Vytvor komplexnú lekciu na tému '${this.lesson.title}' (${this.lesson.topic || ''}) pre predmet '${this.lesson.subject || ''}'. Použi priložené súbory...`;

      const filePaths = this._uploadedFiles.map(f => f.storagePath).filter(Boolean);
      const generationParams = {
          prompt: prompt,
          contentType: this.lesson.contentType,
          filePaths: filePaths
      };

      if (this.lesson.contentType === 'audio') {
          generationParams.episode_count = 3;
      }

      this._wizardMode = false;
      this.requestUpdate();
      await this.updateComplete;

      const activeEditor = this.shadowRoot.querySelector('#active-editor');
      if (activeEditor && activeEditor.handleAiGeneration) {
          activeEditor.handleAiGeneration(generationParams);
      } else {
          console.warn("No active editor to handle generation");
      }
  }

  async _handleManualCreate() {
      if (!this.lesson.title) {
          showToast(translationService.t('professor.editor.title_required'), true);
          return;
      }
      await this._handleSave();
      this._wizardMode = false;
      this.requestUpdate();
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

  _renderWizardMode() {
      return html`
        <div class="min-h-full flex flex-col items-center justify-center p-4 bg-slate-50/50">
            <div class="w-full max-w-3xl bg-white rounded-3xl shadow-xl overflow-hidden animate-fade-in-up">

                <!-- Wizard Header -->
                <div class="bg-gradient-to-r from-indigo-600 to-violet-600 p-8 text-white relative overflow-hidden">
                    <button @click="${this._handleBackClick}" class="absolute left-4 top-4 p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                         <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                    </button>
                    <div class="relative z-10 text-center mt-4">
                        <h2 class="text-3xl font-extrabold mb-2">✨ ${translationService.t('lesson.new') || 'Nová lekce'}</h2>
                        <p class="text-indigo-100">${translationService.t('professor.editor.magic_generator_desc') || 'Vytvořte lekci rychle pomocí AI nebo manuálně'}</p>
                    </div>
                    <div class="absolute right-0 top-0 h-full w-1/2 bg-white/10 transform skew-x-12 translate-x-12"></div>
                </div>

                <div class="p-8 space-y-6">

                    <!-- Metadata Fields -->
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-bold text-slate-700 mb-2">
                                ${translationService.t('professor.editor.title') || 'Název lekce'} <span class="text-red-500">*</span>
                            </label>
                            <input type="text"
                                .value="${this.lesson.title}"
                                @input="${e => this.lesson = { ...this.lesson, title: e.target.value }}"
                                class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-lg font-semibold text-slate-800"
                                placeholder="${translationService.t('professor.editor.lessonTitlePlaceholder') || 'Např. Starověký Řím'}">
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div>
                                <label class="block text-sm font-bold text-slate-700 mb-2">
                                    Předmět
                                </label>
                                <input type="text"
                                    list="subjects-list"
                                    .value="${this.lesson.subject || ''}"
                                    @input="${e => this.lesson = { ...this.lesson, subject: e.target.value }}"
                                    class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-semibold text-slate-800"
                                    placeholder="Např. Dějepis, Fyzika...">
                                <datalist id="subjects-list">
                                    ${this._availableSubjects.map(sub => html`<option value="${sub}"></option>`)}
                                </datalist>
                             </div>
                             <div>
                                <label class="block text-sm font-bold text-slate-700 mb-2">
                                    ${translationService.t('professor.editor.subtitle') || 'Téma / Podnadpis'}
                                </label>
                                <input type="text"
                                    .value="${this.lesson.topic}"
                                    @input="${e => this.lesson = { ...this.lesson, topic: e.target.value }}"
                                    class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                    placeholder="${translationService.t('professor.editor.subtitlePlaceholder') || 'Např. Punské války'}">
                             </div>
                        </div>

                         <div>
                            <label class="block text-sm font-bold text-slate-700 mb-2">
                                Typ obsahu
                            </label>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
                                ${this._renderContentTypeOption('text', '📝', translationService.t('content_types.text'))}
                                ${this._renderContentTypeOption('presentation', '📊', translationService.t('content_types.presentation'))}
                                ${this._renderContentTypeOption('quiz', '❓', translationService.t('content_types.quiz'))}
                                ${this._renderContentTypeOption('test', '📝', translationService.t('content_types.test'))}
                                ${this._renderContentTypeOption('post', '📰', translationService.t('content_types.post') || 'Příspěvek')}
                                ${this._renderContentTypeOption('video', '🎥', translationService.t('content_types.video'))}
                                ${this._renderContentTypeOption('audio', '🎙️', translationService.t('content_types.audio'))}
                                ${this._renderContentTypeOption('comic', '💬', translationService.t('content_types.comic'))}
                            </div>
                         </div>
                    </div>

                    <!-- Files Section -->
                    <div class="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                         <div class="flex items-center justify-between mb-4">
                            <h3 class="font-bold text-slate-700 flex items-center gap-2">
                                📚 ${translationService.t('professor.editor.filesAndRag') || 'Podklady pro AI'}
                            </h3>
                             <div class="flex gap-2">
                                <button @click="${this._handleOpenLibrary}" class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors">
                                    📂 ${translationService.t('common.files_library') || 'Knihovna'}
                                </button>
                                <label class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
                                    📤 ${translationService.t('media.upload_title') || 'Nahrát'}
                                    <input type="file" multiple accept=".pdf,.docx,.txt" class="hidden" @change="${this._handleFilesSelected}" ?disabled="${this._uploading}">
                                </label>
                             </div>
                         </div>

                         ${this._uploadedFiles.length === 0 ? html`
                            <div class="text-center p-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                                <p class="text-sm">${translationService.t('common.files_rag_help') || 'Nahrajte soubory, ze kterých má AI čerpat informace.'}</p>
                            </div>
                         ` : html`
                            <div class="space-y-2">
                                ${this._uploadedFiles.map((file, index) => html`
                                    <div class="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                                        <div class="flex items-center gap-3 overflow-hidden">
                                            <span class="text-red-500 bg-red-50 p-1.5 rounded-lg text-lg">📄</span>
                                            <span class="text-sm font-medium text-slate-700 truncate">${file.name}</span>
                                        </div>
                                        <button @click="${() => this._handleDeleteFile(index)}" class="text-slate-400 hover:text-red-500 p-1">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                        </button>
                                    </div>
                                `)}
                            </div>
                         `}
                    </div>

                    <!-- Actions -->
                    <div class="mt-8 pt-6 border-t border-slate-100 flex justify-end gap-4">
                        <button @click=${this._handleManualCreate} class="px-6 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors">
                           🛠️ Manuálně
                        </button>
                        <button @click=${this._handleAutoMagic} class="px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">
                           ✨ Magicky vygenerovat
                        </button>
                    </div>

                </div>
            </div>
        </div>
      `;
  }

  _renderContentTypeOption(value, icon, label) {
      const isSelected = this.lesson.contentType === value;
      return html`
        <button @click="${() => this.lesson = { ...this.lesson, contentType: value }}"
            class="flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${isSelected ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-100 hover:border-slate-200 bg-white text-slate-500'}">
            <span class="text-2xl mb-1">${icon}</span>
            <span class="text-xs font-bold text-center">${label}</span>
        </button>
      `;
  }

  _renderEditorMode() {
      return html`
      <div class="h-full flex flex-col bg-slate-50/50 relative">
        ${this._renderHeader()}

        <div class="flex-1 overflow-hidden relative">
          <div class="absolute inset-0 overflow-y-auto custom-scrollbar">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

              <!-- Resource Grid (Middle) -->
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 <!-- Classes -->
                 <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 flex flex-col h-full hover:shadow-md transition-shadow">
                    <div class="flex items-center gap-3 mb-4 border-b border-slate-50 pb-2">
                         <span class="text-xl">👥</span>
                         <h3 class="font-bold text-slate-800">${translationService.t('professor.editor.classAssignment')}</h3>
                    </div>
                    ${this._availableClasses.length === 0 ? html`
                        <p class="text-sm text-slate-400 text-center">${translationService.t('professor.no_classes_yet')}</p>
                    ` : html`
                        <div class="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                            ${this._availableClasses.map(group => html`
                                <label class="flex items-center justify-between p-2 rounded-xl border ${this._selectedClassIds.includes(group.id) ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-100 hover:bg-slate-50'} cursor-pointer text-sm">
                                    <span class="font-semibold text-slate-700">${group.name}</span>
                                    <input type="checkbox" .checked="${this._selectedClassIds.includes(group.id)}" @change="${() => this._handleClassToggle(group.id)}" class="rounded text-indigo-600 focus:ring-indigo-500"/>
                                </label>
                            `)}
                        </div>
                    `}
                 </div>

                 <!-- Files -->
                 <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 flex flex-col h-full hover:shadow-md transition-shadow">
                    <div class="flex items-center justify-between gap-3 mb-4 border-b border-slate-50 pb-2">
                         <div class="flex items-center gap-2">
                            <span class="text-xl">📚</span>
                            <h3 class="font-bold text-slate-800">${translationService.t('professor.editor.filesAndRag')}</h3>
                         </div>
                         <div class="flex gap-1">
                             <button @click="${this._handleOpenLibrary}" class="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg" title="${translationService.t('common.files_library')}">📂</button>
                             <label class="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg cursor-pointer" title="${translationService.t('media.upload_title')}">
                                📤 <input type="file" multiple accept=".pdf,.docx,.txt" class="hidden" @change="${this._handleFilesSelected}" ?disabled="${this._uploading}">
                             </label>
                         </div>
                    </div>
                    <div class="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                        ${this._uploadedFiles.map((file, index) => html`
                            <div class="flex items-center justify-between bg-slate-50 p-2 rounded-lg text-sm">
                                <span class="truncate max-w-[150px]" title="${file.name}">${file.name}</span>
                                <button @click="${() => this._handleDeleteFile(index)}" class="text-slate-400 hover:text-red-500">×</button>
                            </div>
                        `)}
                    </div>
                 </div>
              </div>

              <!-- AI Generator Panel -->
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

  _renderHeader() {
    return html`
      <div class="bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex flex-col md:flex-row justify-between items-center py-4 gap-4">

            <div class="flex items-center gap-4 w-full">
              <button @click="${this._handleBackClick}"
                      class="p-2 -ml-2 text-slate-400 hover:text-indigo-600 hover:bg-white/50 rounded-xl transition-all">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                </svg>
              </button>

              <div class="flex-1">
                  <input type="text"
                         .value="${this.lesson.title}"
                         @input="${e => this.lesson = { ...this.lesson, title: e.target.value }}"
                         class="w-full bg-transparent border-none p-0 text-2xl font-extrabold text-slate-800 placeholder-slate-300 focus:ring-0 focus:outline-none"
                         placeholder="${translationService.t('professor.editor.lessonTitlePlaceholder')}">

                   <div class="flex gap-2 text-xs text-slate-500 mt-1">
                        <span>${this.lesson.subject || 'Bez předmětu'}</span>
                        <span>•</span>
                        <span>${this.lesson.contentType}</span>
                   </div>
              </div>
            </div>

            <div class="flex items-center gap-3 flex-shrink-0">
               <button @click="${this._handleSave}"
                      class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-full shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none transition-all ${this.isSaving ? 'opacity-75 cursor-wait' : ''}"
                      ?disabled="${this.isSaving}">
                ${this.isSaving ? translationService.t('common.loading') : translationService.t('professor.editor.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderEditorContent() {
      return html`
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
      if (!this.lesson) {
          return html`<div class="flex justify-center items-center h-full"><div class="spinner"></div></div>`;
      }
      if (this._wizardMode) {
          return this._renderWizardMode();
      }
      return this._renderEditorMode();
  }
}
customElements.define('lesson-editor', LessonEditor);
