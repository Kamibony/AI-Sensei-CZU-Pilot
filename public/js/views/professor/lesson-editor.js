import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { BaseView } from './base-view.js';
import { doc, getDoc, updateDoc, setDoc, collection, getDocs, where, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, getDownloadURL, uploadString } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { db, auth, functions, storage } from '../../firebase-init.js';
import { showToast } from '../../utils.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { translationService } from '../../utils/translation-service.js';
import { callGenerateImage } from '../../gemini-api.js';
import { uploadSingleFile } from '../../utils/upload-handler.js';

// Imports
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
import './editor/editor-view-audio.js';
import './editor/ai-generator-panel.js';
import './editor/professor-header-editor.js';

export class LessonEditor extends BaseView {
  static properties = {
    lesson: { type: Object },
    lessonId: { type: String },
    isSaving: { type: Boolean },
    _activeSection: { state: true, type: String },
    _isLoading: { state: true, type: Boolean },
    _uploadedFiles: { state: true, type: Array },
    _wizardMode: { state: true, type: Boolean },
    _magicStatus: { state: true, type: String },
    _loadError: { state: true, type: Boolean },
    _availableClasses: { state: true, type: Array },
    _selectedClassId: { state: true, type: String }
  };

  constructor() {
    super();
    this.lesson = null;
    this.lessonId = null;
    this._uploadedFiles = [];
    this._wizardMode = true;
    this._magicStatus = '';
    this._activeSection = 'overview';
    this._loadingTimeout = null;
    this._loadError = false;
    this._availableClasses = [];
    this._selectedClassId = '';
  }

  async connectedCallback() {
    super.connectedCallback();
    const urlParams = new URLSearchParams(window.location.search);
    this.lessonId = urlParams.get('id');

    // Robust Auth Check
    this._unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (user) {
            await this._fetchClasses(user.uid);

            if (this.lessonId) {
                this._wizardMode = false;
                await this._loadLesson(this.lessonId, user.uid);
            } else {
                this._initNewLesson();
            }
        } else {
             // Redirect or handle unauthenticated state if needed
             // Usually handled by app router, but here we just stop loading
             this._isLoading = false;
        }
    });

    this._loadingTimeout = setTimeout(() => {
        if (!this.lesson && this._wizardMode) {
            // If still no lesson after timeout, but wizard mode is active,
            // it might just be waiting for user input, so strictly speaking not an error
            // unless we expected a lesson load.
             if (this.lessonId) {
                 console.warn("Safety timeout for lesson load");
                 this._loadError = true;
                 this.requestUpdate();
             }
        }
    }, 5000);
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      if (this._unsubscribeAuth) this._unsubscribeAuth();
      if (this._loadingTimeout) clearTimeout(this._loadingTimeout);
  }

  async _fetchClasses(uid) {
      try {
          const q = query(collection(db, 'groups'), where('ownerId', '==', uid)); // Note: 'groups' collection, based on memory "A groups collection exists"
          const snapshot = await getDocs(q);
          this._availableClasses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
          console.warn("Error fetching classes:", e);
      }
  }

  _initNewLesson() {
    this.lesson = {
      title: '',
      topic: '',
      target_audience: '',
      duration: '',
      language: translationService.currentLanguage || 'cs',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      files: [],
      sections: {},
      status: 'draft',
      classIds: []
    };
    this._wizardMode = true;
    this.requestUpdate();
  }

  async _loadLesson(id, uid) {
      try {
          // Robust check: ownerId or legacy admin
          // But strict owner check is safer for editor
          const q = query(collection(db, 'lessons'), where('id', '==', id));
          const snapshot = await getDocs(q);

          if (!snapshot.empty) {
              const data = snapshot.docs[0].data();
              if (data.ownerId === uid || uid === 'profesor@profesor.cz') { // Allow admin fallback
                  this.lesson = data;
                  this._wizardMode = false;
                  // Sync selected class if possible (first one)
                  if (this.lesson.assignedToGroups && this.lesson.assignedToGroups.length > 0) {
                       this._selectedClassId = this.lesson.assignedToGroups[0];
                  } else if (this.lesson.classIds && this.lesson.classIds.length > 0) {
                       // Legacy field support
                       this._selectedClassId = this.lesson.classIds[0];
                  }
              } else {
                  this._loadError = true; // Not owner
              }
          } else {
              this._loadError = true;
          }
      } catch (e) {
          console.error("Error loading lesson:", e);
          this._loadError = true;
      }
  }

  // --- LOGIC: FILE MANAGEMENT ---

  async _handleFileUpload(e) {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      // Add placeholders to UI state
      const newFileEntries = files.map(f => ({
          file: f, // Raw file object
          name: f.name,
          size: f.size,
          status: 'uploading', // uploading, done, error
          progress: 0,
          storagePath: null,
          fileId: null
      }));

      this._uploadedFiles = [...this._uploadedFiles, ...newFileEntries];
      this.requestUpdate();

      // Trigger uploads
      // Use 'main-course' as placeholder if no specific class is selected, to direct to professor's media
      // The backend 'getSecureUploadUrl' usually handles placing it in the correct path based on metadata
      const courseIdTarget = this._selectedClassId || 'main-course';

      const uploadPromises = newFileEntries.map(async (entry) => {
          try {
              const result = await uploadSingleFile(entry.file, courseIdTarget, (progress) => {
                  entry.progress = progress;
                  this.requestUpdate();
              });

              entry.status = 'done';
              entry.fileId = result.fileId;
              entry.storagePath = result.storagePath;
              entry.url = result.url;
              this.requestUpdate();

          } catch (error) {
              console.error(`Upload failed for ${entry.name}`, error);
              entry.status = 'error';
              entry.error = error.message;
              this.requestUpdate();
              showToast(translationService.t('editor.error_uploading', { file: entry.name }), true);
          }
      });

      await Promise.all(uploadPromises);
  }

  _removeFile(index) {
      this._uploadedFiles.splice(index, 1);
      this._uploadedFiles = [...this._uploadedFiles]; // Trigger reactivity
  }

  // --- LOGIC: NORMALIZATION ---
  _normalizeToGsUrl(fileObj) {
      if (!fileObj) return null;
      // If we have a storagePath from upload-handler, use it.
      // If we have a full gs:// path, return it.

      const bucket = storage.app.options.storageBucket || "ai-sensei-czu-pilot.firebasestorage.app"; // Fallback from memory/init
      let path = fileObj.storagePath || fileObj.fullPath || fileObj.path;

      if (!path) return null;

      // If it's already gs://, great
      if (path.startsWith('gs://')) return path;

      // If it starts with /, remove it
      if (path.startsWith('/')) path = path.substring(1);

      return `gs://${bucket}/${path}`;
  }

  // --- LOGIC: AI CALLER ---
  async _callAiGeneration(type, title, sourceText, filePaths) {
      const generateContentFunc = httpsCallable(functions, 'generateContent');

      // Ensure filePaths are valid strings
      const validFilePaths = (filePaths || []).filter(p => typeof p === 'string' && p.length > 0);

      const result = await generateContentFunc({
          contentType: type,
          promptData: {
              userPrompt: `Create ${type} for ${title}`,
              isMagic: true,
              language: this.lesson.language || 'cs'
          },
          filePaths: validFilePaths,
          sourceText: sourceText // Pass context from Phase 1
      });

      let data = result.data;
      if (typeof data === 'string') {
          const clean = data.replace(/^```json\s*|\s*```$/g, '').trim();
          try {
              data = JSON.parse(clean);
          } catch (e) {
              const lower = clean.toLowerCase();
              if (lower.includes('"error"') || lower.includes('nebyl poskytnut') || lower.includes('no source')) {
                  throw new Error(translationService.t('error.ai_processing_failed') + ": " + clean.substring(0, 50));
              }
              return clean;
          }
      }

      if (data && (data.error || data.chyba)) {
          throw new Error(data.message || data.zpráva || data.error);
      }

      return data;
  }

  async _handleManualCreation() {
      if (!this.lesson.title) {
          showToast(translationService.t('editor.messages.title_required'), true);
          return;
      }
      this._isLoading = true;
      try {
          await this._createLessonSkeleton();
          this._wizardMode = false;
      } catch (e) {
          console.error("Manual creation failed:", e);
          showToast(translationService.t('editor.error_saving'), true);
      } finally {
          this._isLoading = false;
      }
  }

  async _createLessonSkeleton() {
      if (!this.lesson.id) {
         const newRef = doc(collection(db, 'lessons'));
         this.lesson.id = newRef.id;
         this.lesson.ownerId = auth.currentUser.uid;
      }

      // Save Class Assignment
      if (this._selectedClassId) {
          this.lesson.assignedToGroups = [this._selectedClassId];
          this.lesson.classIds = [this._selectedClassId]; // Legacy compat
      }

      // Save Initial Files metadata if any
      const successfulFiles = this._uploadedFiles.filter(f => f.status === 'done').map(f => ({
          name: f.name,
          storagePath: f.storagePath,
          url: f.url
      }));
      if (successfulFiles.length > 0) {
          this.lesson.files = successfulFiles;
      }

      await this._handleSave();
  }

  async _handleAutoMagic() {
      if (!this.lesson.title) {
          showToast(translationService.t('editor.messages.title_required'), true);
          return;
      }

      // Collect successfully uploaded files
      const filePaths = this._uploadedFiles
          .filter(f => f.status === 'done')
          .map(f => this._normalizeToGsUrl(f))
          .filter(p => p !== null);

      console.log("🚀 Magic Payload GS URLs:", filePaths);

      this._isLoading = true;
      this.requestUpdate();

      try {
          // Step 0: Create Skeleton
          await this._createLessonSkeleton();

          const types = ['text', 'presentation', 'quiz', 'test', 'post', 'flashcards', 'mindmap', 'comic'];
          let generatedText = this.lesson.text_content || '';
          let successCount = 0;

          // --- PHASE 1: TEXT GENERATION ---
          if (types.includes('text')) {
              this._magicStatus = translationService.t('editor.status.generating', { type: 'Text' });
              this.requestUpdate();
              try {
                  const res = await this._callAiGeneration('text', this.lesson.title, null, filePaths);
                  generatedText = res.text_content || res.text || (typeof res === 'string' ? res : JSON.stringify(res));

                  this.lesson.text_content = generatedText;
                  await this._handleSave();
                  successCount++;
              } catch (e) {
                  console.error("Text failed:", e);
                  showToast(translationService.t('editor.error_generating_text') + ": " + e.message, true);
                  // Critical failure? If text fails, other phases might be weak. But we proceed.
              }
          }

          // --- PHASE 2: DERIVATIVES (Sequential) ---
          for (const type of types) {
              if (type === 'text') continue;

              const typeLabel = translationService.t(`editor.sidebar.${type}`) || type;
              this._magicStatus = translationService.t('editor.status.generating', { type: typeLabel });
              this.requestUpdate();

              try {
                  // Pass generatedText as sourceText for context
                  const res = await this._callAiGeneration(type, this.lesson.title, generatedText, filePaths);

                  if (type === 'quiz') this.lesson.quiz = { questions: res.questions || res };
                  if (type === 'test') this.lesson.test = { questions: res.questions || res };
                  if (type === 'post') this.lesson.post = res;
                  if (type === 'flashcards') this.lesson.flashcards = res.flashcards || res;
                  if (type === 'mindmap') this.lesson.mindmap = res;

                  if (type === 'presentation') {
                       this.lesson.presentation = { slides: res.slides || res, styleId: 'default' };
                       if (this._generateImagesForSlides) this._generateImagesForSlides(this.lesson.presentation.slides);
                  }
                  if (type === 'comic') {
                      this.lesson.comic = { panels: res.panels || res };
                      if (this._generateImagesForComic) this._generateImagesForComic(this.lesson.comic.panels);
                  }

                  await this._handleSave();
                  successCount++;
              } catch (e) {
                  console.warn(`Skipping ${type}:`, e);
              }
          }

          showToast(translationService.t('editor.messages.magic_success', { count: successCount }), false);
          this._wizardMode = false;

      } catch (e) {
          console.error("Magic fatal:", e);
          showToast(translationService.t('editor.messages.error_generic') + ": " + e.message, true);
      } finally {
          this._isLoading = false;
          this._magicStatus = '';
          this.requestUpdate();
      }
  }

  async _generateImagesForSlides(slides) {
      if (!slides) return;
      for (let i = 0; i < slides.length; i++) {
          if (slides[i].imagePrompt) {
              try {
                  const imageUrl = await callGenerateImage(slides[i].imagePrompt);
                  if (imageUrl) {
                      const uploaded = await this._uploadBase64Image(imageUrl, `slide_${Date.now()}_${i}.png`);
                      slides[i].image = uploaded;
                      this.requestUpdate();
                  }
              } catch (e) { console.warn("Image skip", e); }
          }
      }
  }

  async _generateImagesForComic(panels) {
      if (!panels) return;
      for (let i = 0; i < panels.length; i++) {
          if (panels[i].image_prompt) {
              try {
                  const imageUrl = await callGenerateImage(panels[i].image_prompt);
                  if (imageUrl) {
                      const uploaded = await this._uploadBase64Image(imageUrl, `comic_${Date.now()}_${i}.png`);
                      panels[i].image_url = uploaded;
                      this.requestUpdate();
                  }
              } catch (e) { console.warn("Image skip", e); }
          }
      }
  }

  async _uploadBase64Image(base64, filename) {
      const storageRef = ref(storage, `courses/${auth.currentUser.uid}/media/${filename}`);
      await uploadString(storageRef, base64, 'data_url');
      return await getDownloadURL(storageRef);
  }

  async _handleSave() {
      if (!this.lesson.id) return;
      this.isSaving = true;
      try {
          const docRef = doc(db, 'lessons', this.lesson.id);
          this.lesson.updated_at = new Date().toISOString();
          await setDoc(docRef, this.lesson, { merge: true });
      } catch (e) {
          console.error("Save failed:", e);
      } finally {
          this.isSaving = false;
      }
  }

  // --- UI RENDERERS ---

  render() {
      if (this._loadError) return html`
        <div class="p-8 text-center flex flex-col items-center justify-center h-screen bg-gray-50">
            <h2 class="text-xl font-bold text-red-600 mb-2">${translationService.t('editor.error_loading')}</h2>
            <button class="px-4 py-2 bg-white border border-gray-300 rounded shadow hover:bg-gray-50" @click="${() => location.reload()}">
                ${translationService.t('common.reload')}
            </button>
        </div>`;

      if (this._wizardMode) return this._renderWizard();

      if (!this.lesson) return html`
        <div class="flex items-center justify-center h-screen bg-white">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>`;

      return html`
        <div class="h-screen flex flex-col bg-slate-50">
            <professor-header-editor
                .lesson="${this.lesson}"
                .isSaving="${this.isSaving}"
                @save="${this._handleSave}"
                @back="${() => window.location.href = '/professor/dashboard'}">
            </professor-header-editor>

            <div class="flex-1 flex overflow-hidden">
                <div class="w-64 bg-white border-r border-slate-200 overflow-y-auto hidden md:block">
                    ${this._renderSidebar()}
                </div>

                <div class="flex-1 overflow-y-auto p-8 relative">
                    ${this._isLoading ? html`
                        <div class="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
                            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                            <p class="text-lg font-medium text-slate-700 animate-pulse">${this._magicStatus || translationService.t('common.processing')}</p>
                        </div>
                    ` : ''}

                    ${this._renderActiveSection()}
                </div>
            </div>
        </div>
      `;
  }

  _renderWizard() {
      return html`
      <div class="fixed inset-0 bg-slate-100/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-2xl max-w-5xl w-full p-8 overflow-hidden flex flex-col max-h-[90vh]">
              <div class="text-center mb-8">
                <h2 class="text-3xl font-bold text-slate-800 mb-2">
                    ${translationService.t('editor.wizard.title')}
                </h2>
                <p class="text-slate-500">${translationService.t('editor.wizard.subtitle')}</p>
              </div>

              <div class="flex-1 overflow-y-auto px-1">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                      <div class="space-y-5">
                          <!-- Title -->
                          <div>
                              <label class="block text-sm font-semibold text-slate-700 mb-1">
                                ${translationService.t('editor.fields.title')} <span class="text-red-500">*</span>
                              </label>
                              <input type="text" id="lesson-title"
                                  class="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                  .value="${this.lesson?.title || ''}"
                                  @input="${(e) => this.lesson.title = e.target.value}"
                                  placeholder="${translationService.t('editor.placeholders.title')}">
                          </div>

                          <!-- Metadata -->
                          <div class="grid grid-cols-2 gap-4">
                              <div>
                                  <label class="block text-sm font-medium text-slate-700 mb-1">${translationService.t('editor.fields.subject')}</label>
                                  <input type="text" id="lesson-subject" class="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                                      .value="${this.lesson?.target_audience || ''}"
                                      @input="${(e) => this.lesson.target_audience = e.target.value}"
                                      placeholder="${translationService.t('editor.placeholders.subject')}">
                              </div>
                              <div>
                                  <label class="block text-sm font-medium text-slate-700 mb-1">${translationService.t('editor.fields.topic')}</label>
                                  <input type="text" id="lesson-topic" class="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                                      .value="${this.lesson?.topic || ''}"
                                      @input="${(e) => this.lesson.topic = e.target.value}"
                                      placeholder="${translationService.t('editor.placeholders.topic')}">
                              </div>
                          </div>

                          <!-- Class Selection -->
                          <div>
                              <label class="block text-sm font-medium text-slate-700 mb-1">${translationService.t('editor.fields.class')}</label>
                              <div class="relative">
                                  <select id="class-selector" class="w-full p-3 border border-slate-300 rounded-xl appearance-none bg-white focus:ring-2 focus:ring-indigo-500"
                                      @change="${(e) => this._selectedClassId = e.target.value}">
                                      <option value="">${translationService.t('editor.options.select_class')}</option>
                                      ${this._availableClasses.map(cls => html`
                                          <option value="${cls.id}" ?selected="${this._selectedClassId === cls.id}">${cls.name} (${cls.subject || ''})</option>
                                      `)}
                                  </select>
                                  <div class="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-500">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                                  </div>
                              </div>
                          </div>
                      </div>

                      <!-- File Manager -->
                      <div class="flex flex-col bg-slate-50 rounded-xl border border-slate-200 p-4 h-full min-h-[300px]">
                          <div class="flex justify-between items-center mb-3">
                                <label class="block text-sm font-semibold text-slate-700">${translationService.t('editor.fields.files')}</label>
                                <button id="upload-trigger-btn" class="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full font-medium hover:bg-indigo-200 transition-colors"
                                    @click="${() => this.shadowRoot.getElementById('fileInput').click()}">
                                    + ${translationService.t('editor.actions.add_file')}
                                </button>
                                <input type="file" id="fileInput" class="hidden" multiple @change="${this._handleFileUpload}">
                          </div>

                          <div class="flex-1 overflow-y-auto space-y-2">
                              ${this._uploadedFiles.length > 0 ? html`
                                  ${this._uploadedFiles.map((file, index) => html`
                                      <div class="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm border border-slate-100">
                                          <div class="flex items-center gap-3 overflow-hidden">
                                              <span class="text-xl flex-shrink-0">📄</span>
                                              <div class="flex flex-col min-w-0">
                                                  <span class="text-sm font-medium text-slate-700 truncate block">${file.name}</span>
                                                  <span class="text-xs text-slate-400">
                                                    ${file.status === 'uploading'
                                                        ? html`<span class="text-blue-500">${Math.round(file.progress)}%</span>`
                                                        : file.status === 'error'
                                                            ? html`<span class="text-red-500">Error</span>`
                                                            : html`${(file.size / 1024 / 1024).toFixed(2)} MB`}
                                                  </span>
                                              </div>
                                          </div>
                                          <button class="text-slate-400 hover:text-red-500 p-1" @click="${() => this._removeFile(index)}">
                                              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                          </button>
                                      </div>
                                      ${file.status === 'uploading' ? html`
                                          <div class="h-1 w-full bg-slate-100 rounded-full overflow-hidden mt-[-8px] mb-2 mx-1 relative z-10">
                                              <div class="h-full bg-indigo-500 transition-all duration-300" style="width: ${file.progress}%"></div>
                                          </div>
                                      ` : ''}
                                  `)}
                              ` : html`
                                  <div class="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-lg p-6">
                                      <svg class="w-12 h-12 mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                                      <p class="text-sm text-center">${translationService.t('editor.messages.drag_drop_files')}</p>
                                  </div>
                              `}
                          </div>
                      </div>
                  </div>
              </div>

              <!-- Footer Actions -->
              <div class="flex gap-4 pt-6 border-t border-slate-100 mt-2">
                  <button @click="${this._handleManualCreation}"
                      class="flex-1 px-6 py-4 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-bold text-lg flex items-center justify-center gap-2 transition-transform hover:scale-[1.01]">
                      <span>🛠️</span> ${translationService.t('editor.actions.manual')}
                  </button>

                  <button @click="${this._handleAutoMagic}"
                      ?disabled="${this._uploadedFiles.some(f => f.status === 'uploading')}"
                      class="flex-1 px-6 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl hover:from-indigo-700 hover:to-violet-700 font-bold text-lg shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed">
                      <span>✨</span> ${translationService.t('editor.actions.magic')}
                  </button>
              </div>
          </div>
      </div>`;
  }

  _renderSidebar() {
      const sections = [
          { id: 'text', label: translationService.t('editor.sidebar.text'), icon: '📝' },
          { id: 'presentation', label: translationService.t('editor.sidebar.presentation'), icon: '📊' },
          { id: 'quiz', label: translationService.t('editor.sidebar.quiz'), icon: '❓' },
          { id: 'test', label: translationService.t('editor.sidebar.test'), icon: '📝' },
          { id: 'flashcards', label: translationService.t('editor.sidebar.flashcards'), icon: '🃏' },
          { id: 'comic', label: translationService.t('editor.sidebar.comic'), icon: '💬' },
          { id: 'mindmap', label: translationService.t('editor.sidebar.mindmap'), icon: '🧠' },
          { id: 'post', label: translationService.t('editor.sidebar.post'), icon: '📰' }
      ];

      return html`
          <nav class="p-4 space-y-1">
              ${sections.map(section => html`
                  <button
                      @click="${() => this._activeSection = section.id}"
                      class="w-full flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200
                      ${this._activeSection === section.id
                          ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}">
                      <span class="mr-3 text-xl opacity-80">${section.icon}</span>
                      ${section.label}
                  </button>
              `)}
          </nav>
      `;
  }

  _renderActiveSection() {
      switch(this._activeSection) {
          case 'text': return html`<editor-view-text .lesson="${this.lesson}"></editor-view-text>`;
          case 'presentation': return html`<editor-view-presentation .lesson="${this.lesson}"></editor-view-presentation>`;
          case 'quiz': return html`<editor-view-quiz .lesson="${this.lesson}"></editor-view-quiz>`;
          case 'test': return html`<editor-view-test .lesson="${this.lesson}"></editor-view-test>`;
          case 'flashcards': return html`<editor-view-flashcards .lesson="${this.lesson}"></editor-view-flashcards>`;
          case 'comic': return html`<editor-view-comic .lesson="${this.lesson}"></editor-view-comic>`;
          case 'mindmap': return html`<editor-view-mindmap .lesson="${this.lesson}"></editor-view-mindmap>`;
          case 'post': return html`<editor-view-post .lesson="${this.lesson}"></editor-view-post>`;
          default: return html`<div class="text-center text-gray-500 mt-20">${translationService.t('editor.select_section')}</div>`;
      }
  }
}

customElements.define('lesson-editor', LessonEditor);
