import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { BaseView } from './base-view.js';
import { doc, getDoc, updateDoc, setDoc, arrayUnion, arrayRemove, collection, getDocs, where, query, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, getDownloadURL, uploadString } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, auth, functions, storage } from '../../firebase-init.js';
import { showToast } from '../../utils/utils.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { translationService } from '../../utils/translation-service.js';
import { callGenerateContent, callGenerateImage } from '../../gemini-api.js';

// Imports of all editors
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

import { processFileForRAG, uploadMultipleFiles, uploadSingleFile, renderMediaLibraryFiles, getSelectedFiles, clearSelectedFiles } from '../../utils/upload-handler.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- HELPER: Deep Sanitize for Firestore ---
function deepSanitize(obj) {
    if (obj === undefined) return null;
    if (obj === null || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
        return obj.map(deepSanitize);
    }

    const newObj = {};
    for (const key in obj) {
        const val = deepSanitize(obj[key]);
        if (val !== undefined) {
            newObj[key] = val;
        }
    }
    return newObj;
}

// --- HELPER: Retry Logic for AI calls ---
async function callWithRetry(fn, args = [], retries = 3, delayTime = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn(...args);
        } catch (error) {
            if (error.message && (error.message.includes('INVALID_ARGUMENT') || error.message.includes('safety'))) {
                throw error;
            }
            
            console.warn(`Attempt ${i + 1} failed:`, error);
            if (i === retries - 1) throw error;
            await delay(delayTime);
        }
    }
}

export class LessonEditor extends BaseView {
  static properties = {
    lesson: { type: Object },
    isSaving: { type: Boolean },
    _isLoading: { state: true, type: Boolean },
    _selectedClassIds: { state: true, type: Array },
    _availableClasses: { state: true, type: Array },
    _availableSubjects: { state: true, type: Array },
    _showDeleteConfirm: { state: true, type: Boolean },
    _uploading: { state: true },
    _processingRAG: { state: true },
    _uploadedFiles: { state: true, type: Array },
    _wizardMode: { state: true, type: Boolean },
    _activeTool: { state: true, type: String },
    _isGenerating: { state: true, type: Boolean },
    _magicStatus: { state: true, type: String },
    _longLoading: { state: true, type: Boolean }
  };

  constructor() {
    super();
    this.lesson = null;
    this.isSaving = false;
    this._isLoading = false;
    this._selectedClassIds = [];
    this._availableClasses = [];
    this._availableSubjects = [];
    this._showDeleteConfirm = false;
    this._uploading = false;
    this._processingRAG = false;
    this._uploadedFiles = [];
    this._unsubscribe = null;
    this._authUnsubscribe = null;
    this._magicUnsubscribe = null;
    this._wizardMode = true;
    this._activeTool = null;
    this._isGenerating = false;
    this._magicStatus = '';
    this._loadingTimeout = null;
    this._pendingUpdates = {};
    this._saveTimeout = null;
  }

  // --- NOVÁ OCHRANA (Fix pre miznutie obsahu) ---
  willUpdate(changedProperties) {
      if (changedProperties.has('lesson')) {
          const oldLesson = changedProperties.get('lesson');
          const incomingLesson = this.lesson;

          if (oldLesson && incomingLesson) {
              // 1. Skontrolujeme, či my máme obsah
              const localHasContent = (
                  (oldLesson.podcast_script && oldLesson.podcast_script.length > 0) ||
                  (oldLesson.comic_script && oldLesson.comic_script.length > 0) ||
                  (oldLesson.test && oldLesson.test.length > 0)
              );

              // 2. Skontrolujeme, či rodič (aplikácia) posiela prázdne dáta
              const incomingIsEmpty = (
                  (!incomingLesson.podcast_script || incomingLesson.podcast_script.length === 0) &&
                  (!incomingLesson.comic_script || incomingLesson.comic_script.length === 0) &&
                  (!incomingLesson.test || incomingLesson.test.length === 0)
              );

              // 3. Ak áno, zablokujeme prepísanie a vrátime náš obsah
              if (localHasContent && incomingIsEmpty) {
                  console.warn("[LessonEditor] 🛡️ PARENT GUARD: Ignorujem prázdny update od rodiča.");
                  
                  this.lesson = {
                      ...incomingLesson, // Nové metadata (napr. ID)
                      ...oldLesson,      // Ale starý obsah
                      // Explicitne vrátime kľúčové polia
                      podcast_script: oldLesson.podcast_script,
                      comic_script: oldLesson.comic_script,
                      test: oldLesson.test,
                      quiz: oldLesson.quiz,
                      flashcards: oldLesson.flashcards,
                      presentation: oldLesson.presentation,
                      mindmap: oldLesson.mindmap,
                      social_post: oldLesson.social_post,
                      text_content: oldLesson.text_content,
                      content: oldLesson.content
                  };
              }
          }
      }
      super.willUpdate(changedProperties);
  }

  updated(changedProperties) {
    if (this.lesson && this._loadingTimeout) {
        clearTimeout(this._loadingTimeout);
        this._loadingTimeout = null;
    }

    if (changedProperties.has('lesson')) {
        const oldLesson = changedProperties.get('lesson');
        const newLesson = this.lesson;

        if (this.lesson) {
            this._longLoading = false;
            if (this._loadingTimeout) {
                clearTimeout(this._loadingTimeout);
                this._loadingTimeout = null;
            }
        }

        if (newLesson && newLesson.id) {
            this._selectedClassIds = newLesson.assignedToGroups || [];
            this._uploadedFiles = newLesson.files || [];

            const wasDraft = oldLesson && !oldLesson.id;
            const isSameLesson = oldLesson && newLesson && oldLesson.id === newLesson.id;

            if (!wasDraft && !isSameLesson) {
                this._wizardMode = false;
            }
        } else {
            const isForceReset = newLesson && newLesson._forceReset;
            const isIntentOrEmpty = !newLesson || !newLesson.createdAt;

            if (isForceReset || isIntentOrEmpty) {
                this._selectedClassIds = [];
                this._uploadedFiles = [];
                this._initNewLesson();
            }
        }

        if (this.lesson && this.lesson.magicStatus === 'generating') {
            this._startMagicListener();
        }
    }
  }

  async connectedCallback() {
      super.connectedCallback();
      this.addEventListener('lesson-updated', this._handleLessonUpdatedEvent);
      this.addEventListener('publish-changed', this._handlePublishChanged);
      this._unsubscribe = translationService.subscribe(() => this.requestUpdate());

      this._authUnsubscribe = auth.onAuthStateChanged(async (user) => {
          if (user) {
              await Promise.all([
                  this._fetchAvailableClasses(),
                  this._fetchAvailableSubjects()
              ]);
          } else {
             this._availableClasses = [];
             this._availableSubjects = [];
          }
      });

      // Safety guard: if lesson is not initialized within 3s, force a new draft
      this._loadingTimeout = setTimeout(() => {
          if (!this.lesson) {
              console.warn("Lesson initialization timed out, forcing draft mode.");
              this._initNewLesson();
          }
      }, 3000);

      if (!this.lesson) {
          this._initNewLesson();
      } else if (this.lesson.id) {
          this._wizardMode = false;
      }
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      this.removeEventListener('lesson-updated', this._handleLessonUpdatedEvent);
      this.removeEventListener('publish-changed', this._handlePublishChanged);
      if (this._unsubscribe) this._unsubscribe();
      if (this._authUnsubscribe) this._authUnsubscribe();
      if (this._magicUnsubscribe) this._magicUnsubscribe();
      if (this._loadingTimeout) clearTimeout(this._loadingTimeout);
  }

  _handleLessonUpdatedEvent(e) {
      if (e.detail) {
          let updates = e.detail;
          if (e.detail.partial) {
              updates = e.detail.partial;
          }

          // VERIFICATION LOGGING for State Integrity
          const previousKeys = this.lesson ? Object.keys(this.lesson) : "null";
          const incomingKeys = updates ? Object.keys(updates) : "null";
          console.log("[State Merge] Previous Keys:", previousKeys, "Incoming Keys:", incomingKeys);

          // ARCHITECTURAL FIX: Deep Clone & Safe Merge
          let safeCurrentState = {};
          try {
              if (this.lesson) {
                   // CRITICAL: Deep clone to detach from Proxy
                  safeCurrentState = JSON.parse(JSON.stringify(this.lesson));
              } else {
                  safeCurrentState = {
                      title: '',
                      content: { blocks: [] },
                      files: [],
                      assignedToGroups: [],
                  };
              }
          } catch (err) {
              console.error("[State Merge] Clone failed, falling back to shallow copy", err);
              safeCurrentState = this.lesson ? { ...this.lesson } : {};
          }

          // 2. Perform Merge on POJO
          const nextState = { ...safeCurrentState, ...updates };

          // 3. Integrity Guard Clauses (Ochrana kľúčov)
          const criticalKeys = [
              'id', 'content', 'files', 'assignedToGroups', 'ownerId', 'createdAt',
              'podcast_script', 'comic_script', 'test', 'quiz', 'flashcards', 'mindmap', 
              'social_post', 'slides', 'presentation', 'text_content'
          ];
          
          criticalKeys.forEach(key => {
              if (safeCurrentState[key] !== undefined && nextState[key] === undefined) {
                  console.warn(`[State Merge] Guard: Restoring missing key '${key}' from previous state.`);
                  nextState[key] = safeCurrentState[key];
              }
          });

          // 4. Update Component State
          this.lesson = nextState;
          this.requestUpdate();

          // 5. Accumulate Patch & Save
          this._pendingUpdates = { ...this._pendingUpdates, ...updates };
          this._debouncedSave();
      }
  }

  _debouncedSave() {
      if (this._saveTimeout) clearTimeout(this._saveTimeout);

      this.isSaving = true; // Show "Saving..." immediately
      this.requestUpdate();

      this._saveTimeout = setTimeout(async () => {
          if (Object.keys(this._pendingUpdates).length === 0) {
               this.isSaving = false;
               this.requestUpdate();
               return;
          }

          const updatesToCommit = { ...this._pendingUpdates };
          this._pendingUpdates = {}; // Clear pending queue

          try {
              if (!this.lesson.id) {
                   console.warn("Attempting patch on unsaved lesson. Skipping.");
                   return;
              }

              // Add timestamp
              updatesToCommit.updatedAt = new Date().toISOString();

              console.log("Auto-saving patch:", updatesToCommit); // VERIFICATION LOG

              const lessonRef = doc(db, 'lessons', this.lesson.id);
              await updateDoc(lessonRef, updatesToCommit);

              // If no new updates arrived during save, stop spinner
              if (Object.keys(this._pendingUpdates).length === 0) {
                  this.isSaving = false;
              }
              this.requestUpdate();

          } catch (error) {
              console.error("Auto-save failed", error);
              this.isSaving = false;
              this.requestUpdate();
              // Restore pending updates to retry next time
              this._pendingUpdates = { ...updatesToCommit, ...this._pendingUpdates };
              showToast(translationService.t('common.error'), true);
          }
      }, 2000); // 2 second debounce
  }

  _handlePublishChanged(e) {
      const isPublished = e.detail.isPublished;
      // ARCHITECTURAL FIX: Sync status string with isPublished boolean
      // This ensures data consistency for "Phantom Lesson" prevention
      const newStatus = isPublished ? 'published' : 'draft';
      this.lesson = {
          ...this.lesson,
          isPublished: isPublished,
          status: newStatus
      };
      this.requestUpdate();
  }

  _initNewLesson() {
      const intent = this.lesson?.intent || null;

      // Check for global files from Dashboard upload
      const globalFiles = getSelectedFiles();
      let initialFiles = [];

      if (globalFiles && globalFiles.length > 0) {
          initialFiles = globalFiles.map(f => ({
              id: f.id || 'unknown',
              name: f.name,
              url: '',
              storagePath: f.fullPath,
              uploadedAt: new Date().toISOString()
          }));
          // Clear global files so they don't duplicate if called again
          clearSelectedFiles();
      }

      this.lesson = {
          title: '',
          subject: '',
          topic: '',
          contentType: 'text',
          content: { blocks: [] },
          assignedToGroups: [],
          status: 'draft',
          isPublished: false,
          files: initialFiles,
          createdAt: new Date().toISOString(),
          intent: intent || null
      };

      this._uploadedFiles = initialFiles;
      this._wizardMode = true;
      this._activeTool = null;
      this.requestUpdate();

      if (initialFiles.length > 0) {
          showToast(translationService.t('professor.editor.library_files_added', { count: initialFiles.length }));
      }
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

      let lessonData = {
        ...this.lesson,
        assignedToGroups: this._selectedClassIds,
        files: this._uploadedFiles,
        updatedAt: new Date().toISOString(),
        ownerId: user.uid,
        intent: this.lesson.intent || null
      };

      lessonData = deepSanitize(lessonData);

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
      throw error;
    } finally {
      this.isSaving = false;
    }
  }

  _handleBackToHub() {
      this._activeTool = null;
      this.requestUpdate();
  }

  _handleBackClick() {
      if (this._activeTool) {
          this._handleBackToHub();
          return;
      }
      if (this._wizardMode) {
          this.dispatchEvent(new CustomEvent('navigate', {
              detail: { view: 'dashboard' },
              bubbles: true,
              composed: true
          }));
          return;
      }
      this.dispatchEvent(new CustomEvent('editor-exit', {
          detail: { view: 'library' },
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
      if (this.lesson) {
          this.lesson = { ...this.lesson, assignedToGroups: this._selectedClassIds };
      }
      this.requestUpdate();
      if(this.lesson.title && !this._wizardMode) this._handleSave();
  }

  async _handleFilesSelected(e) {
      const allFiles = Array.from(e.target.files);
      if (allFiles.length === 0) return;

      const files = allFiles.filter(f => f.name.toLowerCase().endsWith('.pdf'));
      if (files.length !== allFiles.length) {
          showToast(translationService.t('professor.editor.pdf_only') || 'Only PDF files are allowed.', true);
      }
      if (files.length === 0) {
          e.target.value = '';
          return;
      }

      if (!this.lesson.title) {
          showToast(translationService.t('professor.editor.title_required'), true);
          e.target.value = '';
          return;
      }

      if (!this.lesson.id) {
          showToast(translationService.t('lesson.draft_creating'), false);
          try {
              await this._handleSave();
          } catch (err) {
              console.error("Auto-save failed before upload", err);
              e.target.value = '';
              return;
          }
      }

      this._uploading = true;
      try {
          const user = auth.currentUser;
          if (!user) throw new Error(translationService.t('media.login_required'));

          const courseId = user.uid;

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
          this.lesson = { ...this.lesson, files: this._uploadedFiles };
          if(this.lesson.title) await this._handleSave();

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
      this._uploadedFiles = this._uploadedFiles.filter((_, i) => i !== fileIndex);
      this.lesson = { ...this.lesson, files: this._uploadedFiles };
      if(this.lesson.title) await this._handleSave();
  }

  _handleOpenLibrary() {
      const modal = document.getElementById('media-library-modal');
      if (!modal) return;

      const user = auth.currentUser;
      const courseId = user ? user.uid : null;
      clearSelectedFiles();
      // Pass user.uid, but the handler logic will be updated to fetch all user files
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
                   this.lesson = { ...this.lesson, files: this._uploadedFiles };
                   if(this.lesson.title) await this._handleSave();
                   showToast(translationService.t('professor.editor.library_files_added', { count: uniqueNewFiles.length }));
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

  async _uploadBase64Image(base64Data, path) {
    const storageRef = ref(storage, path);
    const metadata = {
        contentType: 'image/png',
        customMetadata: {
            'ownerId': auth.currentUser.uid,
            'generatedBy': 'AI_Sensei'
        }
    };
    await uploadString(storageRef, base64Data, 'base64', metadata);
    return await getDownloadURL(storageRef);
  }

  _normalizeToGsUrl(file) {
      const p = file.storagePath || file.fullPath || file.path || file.url || (file.file && file.file.fullPath);
      if (typeof p !== 'string' || !p) return null;

      if (p.startsWith('gs://')) return p;

      // STRICT: Use the specific bucket requested
      const bucketName = "ai-sensei-czu-pilot.firebasestorage.app";
      const relativePath = p.startsWith('/') ? p.slice(1) : p;
      return `gs://${bucketName}/${relativePath}`;
  }

  async _callAiGeneration(type, promptData, filePaths) {
      const generateContentFunc = httpsCallable(functions, 'generateContent');

      // Force language
      const language = translationService.currentLanguage || 'cs';

      try {
          const result = await generateContentFunc({
              contentType: type,
              promptData: promptData,
              filePaths: filePaths,
              language: language
          });

          let responseData = result.data;

          if (typeof responseData === 'string') {
              const cleanJson = responseData.replace(/^```json\s*|\s*```$/g, '').trim();
              try {
                  responseData = JSON.parse(cleanJson);
              } catch (e) {
                  console.warn("Failed to parse JSON even after cleaning:", e);
                  // If it's just text (e.g. for audio/text types), return it as is
                  if (type === 'text' || type === 'audio') {
                      // Keep it as string
                  } else {
                      throw new Error("Model returned malformed JSON");
                  }
              }
          }

          if (responseData && (responseData.error || responseData.chyba)) {
              const msg = responseData.message || responseData.zpráva || responseData.error || responseData.chyba;
              throw new Error(msg);
          }

          return responseData;

      } catch (error) {
          console.error(`AI Generation failed for ${type}:`, error);
          if (error.message && error.message.includes('No source text')) {
             throw new Error(translationService.t('lesson.error_no_source_text'));
          }
          throw error;
      }
  }

  async _generateImagesForSlides(slides) {
      this._magicStatus = `🎨 ${translationService.t('professor.editor.generating_images')}`;
      this.requestUpdate();

      const updatedSlides = [...slides];

      for (const [index, slide] of updatedSlides.entries()) {
          // Robust check: Ensure prompt exists and is not empty
          if (slide.visual_idea && slide.visual_idea.trim().length > 0) {
              let base64Data = '';
              try {
                  const imgResult = await callWithRetry(callGenerateImage, [slide.visual_idea], 3);
                  base64Data = imgResult.imageBase64 || imgResult;
              } catch (err) {
                   console.warn(`Image generation failed for slide ${index}:`, err.message);
                   // Fallback: Safe prompt
                   if (err.message && (err.message.includes("safety") || err.message.includes("INVALID_ARGUMENT") || err.message.includes("Imagen"))) {
                      try {
                          const safePrompt = `Educational illustration: ${this.lesson.title}, minimalist`;
                          const imgResult = await callGenerateImage(safePrompt);
                          base64Data = imgResult.imageBase64 || imgResult;
                      } catch (e) { console.warn("Fallback failed"); }
                   }
              }

              if (base64Data && base64Data.length > 100) {
                  try {
                      const fileName = `slide_${Date.now()}_${index}.png`;
                      const storagePath = `courses/${auth.currentUser.uid}/media/generated/${fileName}`;
                      const url = await this._uploadBase64Image(base64Data, storagePath);
                      updatedSlides[index] = { ...slide, imageUrl: url };
                      if ('backgroundImage' in updatedSlides[index]) delete updatedSlides[index].backgroundImage;
                  } catch (e) { console.warn("Upload failed", e); }
              }
          } else {
              console.warn(`Slide ${index} missing visual_idea. Skipping image generation.`);
              // Optional: Assign a placeholder or keep existing background
          }
      }
      return updatedSlides;
  }

  async _generateImagesForComic(panels) {
       this._magicStatus = `🖍️ ${translationService.t('professor.editor.generating_comic')}`;
       this.requestUpdate();

       const updatedPanels = [...panels];

       for (const [index, panel] of updatedPanels.entries()) {
           // Robust check: Ensure prompt exists
           if (panel.description && panel.description.trim().length > 0) {
              let base64Data = '';
              try {
                  const imgResult = await callWithRetry(callGenerateImage, [`Comic style, ${panel.description}`], 3);
                  base64Data = imgResult.imageBase64 || imgResult;
              } catch (err) {
                  console.warn("Comic gen failed", err.message);
                   if (err.message && (err.message.includes("safety") || err.message.includes("INVALID_ARGUMENT"))) {
                      try {
                           const safePrompt = `Comic panel: ${this.lesson.title}`;
                           const imgResult = await callGenerateImage(safePrompt);
                           base64Data = imgResult.imageBase64 || imgResult;
                      } catch (e) {}
                   }
              }
              if (base64Data && base64Data.length > 100) {
                   try {
                       const fileName = `comic_${Date.now()}_${index}.png`;
                       const storagePath = `courses/${auth.currentUser.uid}/media/generated/${fileName}`;
                       const url = await this._uploadBase64Image(base64Data, storagePath);
                       updatedPanels[index] = { ...panel, imageUrl: url };
                   } catch (e) {}
              }
           } else {
               console.warn(`Panel ${index} missing description. Skipping image generation.`);
           }
       }
       return updatedPanels;
  }

  _resolveStoragePath(file) {
      if (!file) return null;

      let candidatePath = null;

      // 1. Direct storagePath check
      if (file.storagePath &&
          file.storagePath !== 'undefined' &&
          file.storagePath !== 'null' &&
          file.storagePath.includes('/') &&
          file.storagePath.includes('.')) {
          candidatePath = file.storagePath;
      }
      // 2. Metadata check
      else if (file.metadata && file.metadata.fullPath) {
          candidatePath = file.metadata.fullPath;
      }
      // 3. Canonical Construction
      else if (file.name) {
          const user = auth.currentUser;
          if (user && user.uid) {
             // FIX: Include 'media' folder in the path construction
             candidatePath = `courses/${user.uid}/media/${file.name}`;
          }
      }

      // 4. Final Validation
      if (candidatePath) {
          // Check extension
          const validExtensions = ['.pdf', '.docx', '.txt'];
          const hasValidExt = validExtensions.some(ext => candidatePath.toLowerCase().endsWith(ext));

          if (hasValidExt) {
              return candidatePath;
          }
      }

      console.warn("Invalid file path resolution:", file, candidatePath);
      return null;
  }

  async _handleAutoMagic() {
      // 1. Strict Guard: Check files BEFORE anything else
      if (!this._uploadedFiles || this._uploadedFiles.length === 0) {
          showToast(translationService.t('lesson.magic_requires_files') || "Please upload source files first", true);
          return;
      }

      if (!this.lesson.title) {
          showToast(translationService.t('professor.editor.title_required'), true);
          return;
      }

      // 2. Resolve paths
      const validFiles = this._uploadedFiles
          .map(f => ({ file: f, path: this._resolveStoragePath(f) }))
          .filter(item => item.path !== null);
      const filePaths = validFiles.map(item => item.path);

      if (filePaths.length === 0) {
          showToast("System Error: No valid file paths found. Please re-upload documents.", true);
          return;
      }

      console.log("Starting Magic Generation with files:", filePaths);
      this._isLoading = true;
      this._magicStatus = translationService.t('common.magic_status_generating') || "Starting magic...";
      this.requestUpdate();

      try {
          // Save lesson first
          await this._handleSave();

          // Start listener immediately (Backup / Fallback)
          this._startMagicListener();

          // Call backend AND await result for Optimistic Update
          const startMagic = httpsCallable(functions, 'startMagicGeneration', { timeout: 540000 });
          const result = await startMagic({
              lessonId: this.lesson.id,
              filePaths: filePaths,
              lessonTopic: this.lesson.topic || ""
          });

          // OPTIMISTIC UPDATE: Inject data immediately
          if (result.data && result.data.data) {
              console.log("Optimistic Update with Magic Data:", result.data.data);
              const newData = result.data.data;

              // Helper to normalize optimistically
              const safeOptimistic = {
                  ...newData,
                  test: Array.isArray(newData.test) ? newData.test : (newData.test?.questions || []),
                  podcast_script: Array.isArray(newData.podcast_script) ? newData.podcast_script : (newData.podcast_script?.script || []),
                  comic_script: Array.isArray(newData.comic_script) ? newData.comic_script : (newData.comic?.panels || []),
                  mindmap: typeof newData.mindmap === 'string' ? newData.mindmap : (newData.mindmap?.mermaid || ''),
                  social_post: newData.social_post || { platform: 'LinkedIn', content: '', hashtags: '' },
                  flashcards: newData.flashcards || { cards: [] }
              };

              // ARCHITECTURAL FIX: Explicitly queue magic data for persistence
              // This prevents manual edits from overwriting/losing magic content
              // if backend writes haven't propagated or are partial.
              const updates = { ...safeOptimistic, magicStatus: 'ready' };

              // 1. Update Local State
              this.lesson = { ...this.lesson, ...updates };

              // 2. Queue for Persistence
              this._pendingUpdates = { ...this._pendingUpdates, ...updates };

              // 3. Trigger Save
              this._debouncedSave();

              this._isLoading = false;
              this._magicStatus = "";
              this._wizardMode = false;
              showToast(translationService.t('lesson.magic_done') || "Magic generation complete!");
              this.requestUpdate();
          }

      } catch (e) {
          console.error("Magic generation failed:", e);
          showToast(translationService.t('lesson.magic_failed') || "Generation failed", true);
          this._isLoading = false;
      }
  }

  _startMagicListener() {
      if (this._magicUnsubscribe) return;

      console.log("Starting Magic Listener for lesson:", this.lesson.id);
      const lessonRef = doc(db, 'lessons', this.lesson.id);

      this._magicUnsubscribe = onSnapshot(lessonRef, (docSnap) => {
          if (docSnap.exists()) {
              const data = docSnap.data();

              // Explicitly map new fields with safe defaults to ensure frontend stability
              const safeData = {
                  ...data,
                  test: Array.isArray(data.test) ? data.test : (data.test?.questions || []),
                  podcast_script: Array.isArray(data.podcast_script) ? data.podcast_script : (data.podcast_script?.script || []),
                  comic_script: Array.isArray(data.comic_script) ? data.comic_script : (data.comic?.panels || []),
                  mindmap: typeof data.mindmap === 'string' ? data.mindmap : (data.mindmap?.mermaid || ''),
                  social_post: data.social_post || { platform: 'LinkedIn', content: '', hashtags: '' },
                  flashcards: data.flashcards || { cards: [] }
              };

              // --- CRITICAL: Detach Local State for Comparison ---
              // Use a detached copy of the current lesson to avoid Proxy issues during comparison
              let localState = {};
              try {
                  localState = JSON.parse(JSON.stringify(this.lesson || {}));
              } catch (e) {
                  localState = { ...this.lesson };
              }

              // --- ANTI-WIPE GUARD ---
              // Detects if the server snapshot is "stale" (empty) while local state is populated.
              const criticalFields = ['podcast_script', 'comic_script', 'test', 'mindmap', 'flashcards', 'social_post', 'content', 'slides'];

              const checkContent = (v) => {
                  if (!v) return false;
                  if (Array.isArray(v)) return v.length > 0;
                  if (typeof v === 'string') return v.length > 0;
                  // Handle object wrappers
                  if (v.cards && Array.isArray(v.cards)) return v.cards.length > 0;
                  if (v.content && typeof v.content === 'string') return v.content.length > 0; 
                  if (v.questions && Array.isArray(v.questions)) return v.questions.length > 0;
                  if (v.slides && Array.isArray(v.slides)) return v.slides.length > 0;
                  if (v.blocks && Array.isArray(v.blocks)) return v.blocks.length > 0;
                  if (v.panels && Array.isArray(v.panels)) return v.panels.length > 0;
                  if (v.mermaid && typeof v.mermaid === 'string') return v.mermaid.length > 0;
                  if (v.script && Array.isArray(v.script)) return v.script.length > 0;
                  return false;
              };

              for (const field of criticalFields) {
                  const localVal = localState[field];
                  const serverVal = safeData[field];

                  if (checkContent(localVal) && !checkContent(serverVal)) {
                       console.warn(`[Anti-Wipe] CRITICAL: Server snapshot missing content for '${field}' while local exists. Aborting update.`);
                       return;
                  }
              }

              // CRITICAL FIX: Merge Priority
              // If we have pending updates, or just finished saving, we prioritize LOCAL state + PENDING patches
              // over the (potentially stale) server snapshot.
              const hasPendingUpdates = Object.keys(this._pendingUpdates).length > 0;

              if (this.isSaving || hasPendingUpdates) {
                  this.lesson = {
                      ...safeData, // Server is base
                      ...localState, // Local keeps optimistics
                      ...this._pendingUpdates // Pending overwrites everything
                  };
              } else {
                  // Standard sync: Server is truth, but merge gently
                  this.lesson = { ...localState, ...safeData };
              }

              if (data.debug_logs && Array.isArray(data.debug_logs)) {
                  console.groupCollapsed("Magic Debug Logs");
                  data.debug_logs.forEach(log => console.log(log));
                  console.groupEnd();
              }

              const currentStatus = this.lesson.magicStatus;

              if (currentStatus === 'generating') {
                   this._isLoading = true;
                   this._magicStatus = data.magicProgress || "Generating...";
              } else if (currentStatus === 'ready') {
                   this._isLoading = false;
                   this._magicStatus = "";
                   this._wizardMode = false;
                   showToast(translationService.t('lesson.magic_done') || "Magic generation complete!");

                   if (this._magicUnsubscribe) {
                       this._magicUnsubscribe();
                       this._magicUnsubscribe = null;
                   }
              } else if (currentStatus === 'error') {
                   this._isLoading = false;
                   showToast("Generation error occurred.", true);
                   if (this._magicUnsubscribe) {
                       this._magicUnsubscribe();
                       this._magicUnsubscribe = null;
                   }
              }
              this.requestUpdate();
          }
      }, (error) => {
          console.error("Magic listener error:", error);
      });
  }

  // ... rest of the file ...
  
  async _handleManualCreate() {
      if (!this.lesson.title) {
          showToast(translationService.t('professor.editor.title_required'), true);
          return;
      }
      
      try {
          await this._handleSave();
          this._wizardMode = false;
          this._activeTool = null;
          this.requestUpdate();
      } catch (e) {
          // Toast is already shown in _handleSave
      }
  }

  async _handleMagicGeneration(e) {
      const { prompt } = e.detail;
      const filePaths = this._uploadedFiles.map(f => f.storagePath).filter(Boolean);

      const generationParams = {
          prompt: prompt,
          contentType: this._activeTool || this.lesson.contentType,
          filePaths: filePaths
      };

      if ((this._activeTool || this.lesson.contentType) === 'audio') {
          generationParams.episode_count = 3;
      }

      const activeEditor = this.shadowRoot.querySelector('#active-editor');
      if (activeEditor && activeEditor.handleAiGeneration) {
           try {
               await activeEditor.handleAiGeneration(generationParams);
               this.requestUpdate();
               showToast(translationService.t('lesson.magic_done'));
           } catch (e) {
               console.error("AI Gen Error", e);
               showToast(translationService.t('common.error'), true);
           }
      } else {
          console.error("Active editor not found or handleAiGeneration missing", activeEditor);
      }
  }

  _renderWizardMode() {
      if (this._isLoading) {
          return html`
              <div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
                 <div class="spinner w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                 <h2 class="text-2xl font-bold text-slate-800 animate-pulse">✨ ${translationService.t('lesson.magic_creating_title')}</h2>
                 <p class="text-slate-500 mt-2">${this._magicStatus || translationService.t('lesson.magic_creating_desc')}</p>
              </div>
           `;
      }
      return html`
        <div class="min-h-full flex flex-col items-center justify-center p-4 bg-slate-50/50">
            ${this._isGenerating ? html`
                <div class="fixed inset-0 bg-white/90 z-50 flex flex-col items-center justify-center">
                    <div class="text-center space-y-4">
                         <div class="text-6xl animate-bounce">✨</div>
                         <h2 class="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
                             Creating magic...
                         </h2>
                         <p class="text-slate-500">Generating lesson content from your files</p>
                         <div class="w-64 h-2 bg-slate-100 rounded-full overflow-hidden mx-auto mt-4">
                             <div class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-pulse w-full"></div>
                         </div>
                    </div>
                </div>
            ` : ''}

            <div class="w-full max-w-3xl bg-white rounded-3xl shadow-xl flex flex-col max-h-[90vh] animate-fade-in-up overflow-hidden">

                <div class="bg-gradient-to-r from-indigo-600 to-violet-600 p-8 text-white relative flex-shrink-0">
                    <button @click="${this._handleBackClick}" class="absolute left-4 top-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors" title="${translationService.t('common.back')}">
                         <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                    </button>
                    <div class="relative z-10 text-center mt-4">
                        <h2 class="text-3xl font-extrabold mb-2">✨ ${translationService.t('lesson.new')}</h2>
                        <p class="text-indigo-100">${translationService.t('professor.editor.magic_generator_desc')}</p>
                    </div>
                    <div class="absolute right-0 top-0 h-full w-1/2 bg-white/10 transform skew-x-12 translate-x-12"></div>
                </div>

                <div class="p-8 space-y-6 overflow-y-auto custom-scrollbar">
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-bold text-slate-700 mb-2">
                                ${translationService.t('professor.editor.title')} <span class="text-red-500">*</span>
                            </label>
                            <input type="text"
                                .value="${this.lesson.title || ''}"
                                @input="${e => this.lesson = { ...this.lesson, title: e.target.value }}"
                                class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-lg font-semibold text-slate-800"
                                placeholder="${translationService.t('professor.editor.lessonTitlePlaceholder')}">
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div>
                                <label class="block text-sm font-bold text-slate-700 mb-2">${translationService.t('professor.editor.subject')}</label>
                                <input type="text" list="subjects-list"
                                    .value="${this.lesson.subject || ''}"
                                    @input="${e => this.lesson = { ...this.lesson, subject: e.target.value }}"
                                    class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-semibold text-slate-800"
                                    placeholder="${translationService.t('professor.editor.subject_placeholder')}">
                                <datalist id="subjects-list">
                                    ${this._availableSubjects.map(sub => html`<option value="${sub}"></option>`)}
                                </datalist>
                             </div>
                             <div>
                                <label class="block text-sm font-bold text-slate-700 mb-2">${translationService.t('professor.editor.subtitle')}</label>
                                <input type="text"
                                    .value="${this.lesson.topic || ''}"
                                    @input="${e => this.lesson = { ...this.lesson, topic: e.target.value }}"
                                    class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                    placeholder="${translationService.t('professor.editor.subtitlePlaceholder')}">
                             </div>
                        </div>
                    </div>

                    <div class="bg-slate-50 border border-slate-200 rounded-xl p-6 mt-6">
                        <div class="flex items-center justify-between mb-4">
                            <div>
                                <h3 class="font-bold text-slate-800 text-lg">📂 ${translationService.t('professor.editor.rag_context')}</h3>
                                <p class="text-slate-500 text-sm">${translationService.t('professor.editor.rag_help')}</p>
                            </div>
                            <div class="flex gap-2">
                                 <button @click="${this._handleOpenLibrary}" class="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 text-sm font-semibold transition-colors">
                                    ${translationService.t('professor.editor.library_btn')}
                                 </button>
                                 <label class="px-3 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg cursor-pointer hover:bg-indigo-100 text-sm font-bold transition-colors flex items-center gap-2">
                                    <span>📤 ${translationService.t('professor.editor.upload_btn')}</span>
                                    <input type="file" multiple accept=".pdf" class="hidden" @change="${this._handleFilesSelected}" ?disabled="${this._uploading}">
                                 </label>
                            </div>
                        </div>

                        ${this._uploading ? html`
                            <div class="flex items-center justify-center p-4 text-indigo-600">
                                <div class="spinner w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mr-3"></div>
                                <span class="text-sm font-medium">${translationService.t('lesson.upload_uploading')}</span>
                            </div>
                        ` : ''}

                        ${this._uploadedFiles.length > 0 ? html`
                            <div class="space-y-2 mt-4">
                                ${this._uploadedFiles.map((file, index) => html`
                                    <div class="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                                        <div class="flex items-center gap-3 overflow-hidden">
                                            <span class="text-xl">📄</span>
                                            <div class="flex flex-col min-w-0">
                                                <span class="text-sm font-semibold text-slate-700 truncate">${file.name}</span>
                                                <span class="text-xs text-slate-400">${translationService.t('professor.editor.ready_for_ai')}</span>
                                            </div>
                                        </div>
                                        <button @click="${() => this._handleDeleteFile(index)}" class="p-1 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-50 transition-colors">
                                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                        </button>
                                    </div>
                                `)}
                            </div>
                        ` : html`
                            <div class="text-center py-8 border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center gap-3">
                                <p class="text-slate-400 text-sm">${html`${translationService.t('professor.editor.no_files_magic_hint')}`}</p>
                                <button @click="${this._handleOpenLibrary}" class="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition-colors">
                                    📂 ${translationService.t('professor.editor.library_btn')}
                                </button>
                            </div>
                        `}
                    </div>

                    <div class="mt-8 pt-6 border-t border-slate-100 flex justify-end gap-4">
                        <button @click=${this._handleManualCreate} class="px-6 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors">
                           🛠️ ${translationService.t('professor.manual_create')}
                        </button>

                        <div class="relative group">
                            <button @click=${this._handleAutoMagic}
                                    ?disabled="${this._uploadedFiles.length === 0}"
                                    class="px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none">
                               ✨ ${translationService.t('lesson.magic_btn')}
                            </button>
                             ${this._uploadedFiles.length === 0 ? html`
                                <div class="absolute bottom-full right-0 mb-2 w-64 p-2 bg-slate-800 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-center z-50">
                                    ${translationService.t('lesson.magic_files_required_tooltip')}
                                </div>
                            ` : ''}
                        </div>
                    </div>

                </div>
            </div>
        </div>
      `;
  }

  _renderFilesSection() { return html``; }
  
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

  _renderClassesPanel() {
      return html`
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
      `;
  }

  _renderFilesPanel() {
      return html`
         <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 flex flex-col h-full hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between gap-3 mb-4 border-b border-slate-50 pb-2">
                 <div class="flex items-center gap-2">
                    <span class="text-xl">📚</span>
                    <h3 class="font-bold text-slate-800">${translationService.t('professor.editor.filesAndRag')}</h3>
                 </div>
                 <div class="flex gap-1">
                     <button @click="${this._handleOpenLibrary}" class="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg" title="${translationService.t('common.files_library')}">📂</button>
                     <label class="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg cursor-pointer" title="${translationService.t('media.upload_title')}">
                        📤 <input type="file" multiple accept=".pdf" class="hidden" @change="${this._handleFilesSelected}" ?disabled="${this._uploading}">
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
      `;
  }

  _renderLessonHub() {
      if (this._isLoading) {
          return html`
              <div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
                 <div class="spinner w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                 <h2 class="text-2xl font-bold text-slate-800 animate-pulse">✨ ${translationService.t('lesson.magic_creating_title')}</h2>
                 <p class="text-slate-500 mt-2">${this._magicStatus || translationService.t('lesson.magic_creating_desc')}</p>
              </div>
           `;
      }
      return html`
      <div class="h-full flex flex-col bg-slate-50/50 relative">
        ${this._renderHeader()}

        <div class="flex-1 overflow-hidden relative">
          <div class="absolute inset-0 overflow-y-auto custom-scrollbar">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

              <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 ${this._renderClassesPanel()}
                 ${this._renderFilesPanel()}
              </div>

              <div class="space-y-4">
                  <div class="flex items-center justify-between">
                     <h3 class="font-bold text-slate-800 text-xl flex items-center gap-2">
                        ✨ ${translationService.t('professor.editor.lesson_content')}
                     </h3>
                  </div>

                  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      ${this._renderContentCard('text', '📝', translationService.t('content_types.text'), this.lesson.text_content || (this.lesson.content?.blocks?.length > 0))}
                      ${this._renderContentCard('presentation', '📊', translationService.t('content_types.presentation'), this.lesson.slides?.length > 0 || this.lesson.presentation?.slides?.length > 0)}
                      ${this._renderContentCard('quiz', '❓', translationService.t('content_types.quiz'), this.lesson.questions?.length > 0 || this.lesson.quiz?.questions?.length > 0)}
                      ${this._renderContentCard('test', '📝', translationService.t('content_types.test'), this.lesson.test?.questions?.length > 0)}
                      ${this._renderContentCard('post', '📰', translationService.t('content_types.post'), !!this.lesson.postContent)}
                      ${this._renderContentCard('video', '🎥', translationService.t('content_types.video'), !!this.lesson.videoUrl)}
                      ${this._renderContentCard('audio', '🎙️', translationService.t('content_types.audio'), (this.lesson.podcast_script?.script?.length > 0) || !!this.lesson.audioContent)}
                      ${this._renderContentCard('comic', '💬', translationService.t('content_types.comic'), this.lesson.comic?.panels?.length > 0)}
                      ${this._renderContentCard('flashcards', '🃏', translationService.t('content_types.flashcards'), this.lesson.flashcards?.cards?.length > 0)}
                      ${this._renderContentCard('mindmap', '🧠', translationService.t('content_types.mindmap'), !!this.lesson.mindmap?.mermaid)}
                  </div>
              </div>

            </div>
          </div>
        </div>
      </div>
      `;
  }

  _renderContentCard(type, icon, label, hasContent) {
      return html`
        <button @click="${() => { this._activeTool = type; this.lesson = { ...this.lesson, contentType: type }; }}"
            class="relative flex flex-col items-center justify-center p-6 rounded-3xl border-2 transition-all group
            ${hasContent
                ? 'bg-white border-emerald-100 hover:border-emerald-300 hover:shadow-lg'
                : 'bg-white border-slate-100 hover:border-indigo-200 hover:shadow-md'}">

            ${hasContent ? html`
                <div class="absolute top-3 right-3 text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    ${translationService.t('common.done')}
                </div>
            ` : nothing}

            <span class="text-4xl mb-3 transform group-hover:scale-110 transition-transform duration-300">${icon}</span>
            <span class="font-bold text-slate-700 text-sm">${label}</span>

            ${!hasContent ? html`
                <span class="text-xs text-slate-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Klikni pro vytvoření</span>
            ` : nothing}
        </button>
      `;
  }

  _renderSpecificToolEditor() {
      return this._renderSpecificEditor();
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
                        <span>${this.lesson.subject || translationService.t('common.no_subject') || 'Bez předmětu'}</span>
                        <span>•</span>
                        <span>${this.lesson.topic || translationService.t('common.no_topic') || 'Bez tématu'}</span>
                   </div>
              </div>
            </div>

            <div class="flex items-center gap-3 flex-shrink-0">
               <button @click="${() => this._handlePublishChanged({ detail: { isPublished: !this.lesson.isPublished } })}"
                       class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-full shadow-sm text-white transition-all ${this.lesson?.isPublished ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-500 hover:bg-slate-600'}"
                       title="${this.lesson?.isPublished ? (translationService.t('lesson.status_published') || 'Publikované') : (translationService.t('lesson.status_draft') || 'Koncept')}">
                   <span class="mr-2">${this.lesson?.isPublished ? '🚀' : '📝'}</span>
                   ${this.lesson?.isPublished ? (translationService.t('lesson.status_published') || 'Publikované') : (translationService.t('lesson.status_draft') || 'Koncept')}
               </button>

                <div class="flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${this.isSaving ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}">
                    ${this.isSaving ? html`
                        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-indigo-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>${translationService.t('common.saving') || 'Ukládání...'}</span>
                    ` : html`
                        <span class="mr-1.5">☁️</span>
                        <span>${translationService.t('all_saved') || 'Vše uloženo'}</span>
                    `}
                </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderSpecificEditor() {
      const handleUpdate = this._handleLessonUpdatedEvent.bind(this);

      switch (this._activeTool) {
          case 'text': 
              return html`<editor-view-text @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${handleUpdate} 
                  id="active-editor" class="w-full h-full block"></editor-view-text>`;
          
          case 'presentation': 
              return html`<editor-view-presentation @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${handleUpdate}
                  id="active-editor" class="w-full h-full block"></editor-view-presentation>`;
          
          case 'quiz': 
              return html`<editor-view-quiz @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${handleUpdate}
                  id="active-editor" class="w-full h-full block"></editor-view-quiz>`;
          
          case 'test': 
              return html`<editor-view-test @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${handleUpdate}
                  id="active-editor" class="w-full h-full block"></editor-view-test>`;
          
          case 'post': 
              return html`<editor-view-post @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${handleUpdate}
                  id="active-editor" class="w-full h-full block"></editor-view-post>`;
          
          case 'video': 
              return html`<editor-view-video @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${handleUpdate} 
                  id="active-editor" class="w-full h-full block"></editor-view-video>`;
          
          case 'comic': 
              return html`<editor-view-comic @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${handleUpdate}
                  id="active-editor" class="w-full h-full block"></editor-view-comic>`;
          
          case 'flashcards': 
              return html`<editor-view-flashcards @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${handleUpdate}
                  id="active-editor" class="w-full h-full block"></editor-view-flashcards>`;
          
          case 'mindmap': 
              return html`<editor-view-mindmap @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${handleUpdate}
                  id="active-editor" class="w-full h-full block"></editor-view-mindmap>`;

          case 'audio':
              return html`<editor-view-audio @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${handleUpdate}
                  id="active-editor" class="w-full h-full block"></editor-view-audio>`;
                  
          default: return html`<div class="p-4 text-center text-red-500">${translationService.t('common.unknown_type')}</div>`;
      }
  }

  render() {
      if (!this.lesson) {
          if (this._longLoading) {
             return html`
                <div class="flex flex-col justify-center items-center h-full space-y-4">
                    <p class="text-slate-500">${translationService.t('common.loading_slow') || 'Nahrávání trvá déle než obvykle...'}</p>
                    <button @click="${() => window.location.reload()}"
                            class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                        ${translationService.t('common.reload') || 'Načíst znovu'}
                    </button>
                </div>
             `;
          }
          return html`<div class="flex justify-center items-center h-full"><div class="spinner"></div></div>`;
      }
      if (this._wizardMode) {
          return this._renderWizardMode();
      }
      if (this._activeTool) {
          return this._renderSpecificEditor();
      }
      return this._renderLessonHub();
  }
}
customElements.define('lesson-editor', LessonEditor);
