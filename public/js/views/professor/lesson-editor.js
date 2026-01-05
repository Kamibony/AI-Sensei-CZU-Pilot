import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { BaseView } from './base-view.js';
import { doc, getDoc, updateDoc, setDoc, arrayUnion, arrayRemove, collection, getDocs, where, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, getDownloadURL, uploadString } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, auth, functions, storage } from '../../firebase-init.js';
import { showToast } from '../../utils.js';
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

import { processFileForRAG, uploadMultipleFiles, uploadSingleFile } from '../../utils/upload-handler.js';
import { renderMediaLibraryFiles, getSelectedFiles, clearSelectedFiles } from '../../upload-handler.js';

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
    this._wizardMode = true;
    this._activeTool = null;
    this._isGenerating = false;
    this._magicStatus = '';
    this._loadingTimeout = null;
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
    }
  }

  async connectedCallback() {
      super.connectedCallback();
      this.addEventListener('lesson-updated', this._handleLessonUpdatedEvent);
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
      if (this._unsubscribe) this._unsubscribe();
      if (this._authUnsubscribe) this._authUnsubscribe();
      if (this._loadingTimeout) clearTimeout(this._loadingTimeout);
  }

  _handleLessonUpdatedEvent(e) {
      if (e.detail) {
          if (!this.lesson) {
              this.lesson = e.detail;
              this.requestUpdate();
              return;
          }

          // Check if data actually changed to prevent render loops
          const hasChanges = Object.keys(e.detail).some(key => {
              // Simple strict equality check
              // For objects/arrays, this relies on reference equality which is appropriate
              // because immutable updates (creating new objects) should trigger re-render,
              // but re-emitting same object reference shouldn't.
              // If the issue is deep equality of identical new objects, this might be insufficient,
              // but it's the standard first step for "Optimize Updates".
              return this.lesson[key] !== e.detail[key];
          });

          if (hasChanges) {
              this.lesson = { ...this.lesson, ...e.detail };
              this.requestUpdate();
          }
      }
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
      this._uploadedFiles.splice(fileIndex, 1);
      this._uploadedFiles = [...this._uploadedFiles];
      this.lesson = { ...this.lesson, files: this._uploadedFiles };
      if(this.lesson.title) await this._handleSave();
  }

  _handleOpenLibrary() {
      const modal = document.getElementById('media-library-modal');
      if (!modal) return;

      const user = auth.currentUser;
      const courseId = user ? user.uid : 'main-course';
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
          if (slide.visual_idea) {
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
          }
      }
      return updatedSlides;
  }

  async _generateImagesForComic(panels) {
       this._magicStatus = `🖍️ ${translationService.t('professor.editor.generating_comic')}`;
       this.requestUpdate();

       const updatedPanels = [...panels];

       for (const [index, panel] of updatedPanels.entries()) {
           if (panel.description) {
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
           }
       }
       return updatedPanels;
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

      // Path Normalization
      const filePaths = this._uploadedFiles
          .map(f => this._normalizeToGsUrl(f))
          .filter(Boolean);

      if (filePaths.length === 0) {
           console.error("Frontend Error: Failed to extract storage paths", this._uploadedFiles);
           showToast(translationService.t('lesson.upload_error'), true);
           return;
      }

      this._isLoading = true;
      
      try {
          await this._handleSave();
          this._wizardMode = false;
          this.requestUpdate();
      } catch (e) {
          console.error("Save failed before magic:", e);
          showToast(translationService.t('lesson.save_error_before_magic'), true);
          this._isLoading = false;
          return;
      }

      const allTypes = ['text', 'presentation', 'quiz', 'test', 'post', 'flashcards', 'mindmap', 'comic', 'audio'];
      let successCount = 0;
      let failedTypes = [];

      // Reusable generation logic
      const processType = async (type) => {
            this._magicStatus = `${translationService.t('common.magic_status_generating')} (${successCount + failedTypes.length + 1}/${allTypes.length}): ${(translationService.t(`content_types.${type}`) || type).toUpperCase()}...`;
            this.requestUpdate();

            let promptData = { userPrompt: '', isMagic: true };

            // STRICT: Pass sourceText if available (Sequential Generation Fix)
            if (type !== 'text' && this.lesson.text_content) {
                promptData.sourceText = this.lesson.text_content;
            }

            const title = this.lesson.title;
            const topic = this.lesson.topic ? `(${this.lesson.topic})` : '';

            switch (type) {
                case 'text':
                    promptData.userPrompt = translationService.t('prompts.text_gen', { title, topic });
                    break;
                case 'presentation':
                    promptData.userPrompt = translationService.t('prompts.presentation_gen', { title });
                    promptData.slide_count = 8;
                    break;
                case 'quiz':
                    promptData.question_count = 5;
                    promptData.userPrompt = translationService.t('prompts.quiz_gen', { title });
                    break;
                case 'test':
                    promptData.question_count = 10;
                    promptData.difficulty = 'Střední';
                    promptData.userPrompt = translationService.t('prompts.test_gen', { title });
                    break;
                case 'post':
                    promptData.episode_count = 3;
                    promptData.userPrompt = translationService.t('prompts.podcast_gen', { title });
                    break;
                case 'flashcards':
                    promptData.userPrompt = translationService.t('prompts.flashcards_gen', { title });
                    break;
                case 'mindmap':
                    promptData.userPrompt = translationService.t('prompts.mindmap_gen', { title });
                    break;
                case 'comic':
                    promptData.userPrompt = translationService.t('prompts.comic_gen', { title });
                    break;
                case 'audio':
                     promptData.userPrompt = translationService.t('prompts.audio_gen', { title }) || `Write a podcast script about ${title}`;
                     break;
            }

            const currentLocale = translationService.locale || 'cs';
            promptData.userPrompt += `\n\nIMPORTANT: The output MUST be in ${currentLocale} language only.`;

            const generateContentFunc = httpsCallable(functions, 'generateContent');
            const result = await generateContentFunc({
                contentType: contentType,
                promptData: promptData,
                filePaths: filePaths
            });

            let responseData = result.data;

            if (typeof responseData === 'string') {
                // STRIP MARKDOWN CODE BLOCKS
                const cleanJson = responseData.replace(/^```json\s*|\s*```$/g, '').trim();
                try {
                    responseData = JSON.parse(cleanJson);
                } catch (e) {
                    console.warn("Failed to parse JSON even after cleaning:", e);
                    // Fallback: keep responseData as string
                }
            }

            if (responseData && (responseData.error || responseData.chyba)) {
                const msg = responseData.message || responseData.zpráva || responseData.error || responseData.chyba;
                throw new Error(msg);
            }

            let data = JSON.parse(JSON.stringify(responseData));

            // Post-processing: Images & Audio
            if (type === 'post' && data.podcast_series && data.podcast_series.episodes) {
                 this._magicStatus = `🎙️ ${translationService.t('professor.editor.generating_audio')}`;
                 this.requestUpdate();
                 const generateAudioFunc = httpsCallable(functions, 'generatePodcastAudio');
                 for (const [index, ep] of data.podcast_series.episodes.entries()) {
                     if (!ep.script) continue;
                     try {
                        const audioResult = await generateAudioFunc({
                            lessonId: this.lesson.id,
                            text: ep.script,
                            episodeIndex: index,
                            language: translationService.currentLanguage
                        });
                        if (audioResult.data && audioResult.data.storagePath) {
                            const storageRef = ref(storage, audioResult.data.storagePath);
                            const url = await getDownloadURL(storageRef);
                            data.podcast_series.episodes[index] = { ...ep, audioUrl: url, storagePath: audioResult.data.storagePath };
                        }
                     } catch (err) { console.warn("Audio gen failed", err); }
                 }
            }

            if (type === 'presentation' && data.slides) {
                data.slides = await this._generateImagesForSlides(data.slides);
            }

             if (type === 'comic' && data.panels) {
                 data.panels = await this._generateImagesForComic(data.panels);
             }

            // Apply data to lesson
            switch (type) {
                case 'text':
                    let textContent = data.text || data;
                    if (typeof textContent === 'object') {
                         if (textContent.prompts && Array.isArray(textContent.prompts)) {
                            textContent = textContent.prompts.map(p => `### ${p.nadpis}\n${p.prompt}\n\n*${p.popis}*`).join('\n\n---\n\n');
                         } else {
                            textContent = JSON.stringify(textContent, null, 2);
                         }
                    }
                    this.lesson = { ...this.lesson, text_content: textContent };
                    break;
                case 'presentation':
                    this.lesson = { ...this.lesson, presentation: { slides: data.slides, styleId: 'default' } };
                    break;
                case 'quiz':
                    this.lesson = { ...this.lesson, quiz: { questions: data.questions } };
                    break;
                case 'test':
                    this.lesson = { ...this.lesson, test: { questions: data.questions } };
                    break;
                case 'post':
                    const textRep = data.lesson ? `${data.lesson.title}\n\n${data.lesson.description}\n\n${(data.lesson.modules||[]).map(m=>m.title+': '+m.content).join('\n')}` : JSON.stringify(data);
                    this.lesson = { ...this.lesson, postContent: data, content: { text: textRep, author: 'ai_sensei' } };
                    break;
                case 'flashcards':
                    this.lesson = { ...this.lesson, flashcards: data };
                    break;
                case 'mindmap':
                    this.lesson = { ...this.lesson, mindmap: data };
                    break;
                case 'comic':
                    this.lesson = { ...this.lesson, comic: data };
                    break;
                case 'audio':
                    const audioScript = data.script || data.text || (typeof data === 'string' ? data : '');
                    this.lesson = { ...this.lesson, content: { ...this.lesson.content, script: audioScript } };
                    break;
            }

            await this._handleSave();
            successCount++;
      };

      try {
          // STRICT Phase 1: Text First
          try {
              await processType('text');
          } catch (e) {
              console.error("Failed to generate text:", e);
              failedTypes.push('text');
          }

          // STRICT Phase 2: Other types sequentially
          const otherTypes = allTypes.filter(t => t !== 'text');
          for (const type of otherTypes) {
             try {
                await processType(type);
             } catch (error) {
                 console.error(`Failed to generate ${type}:`, error);
                 failedTypes.push(type);
             }
          }

          const msg = `${translationService.t('lesson.magic_done_stats', { success: successCount, total: allTypes.length })}` +
                      (failedTypes.length ? ` ${translationService.t('common.errors')}: ${failedTypes.join(', ')}` : '');
          showToast(msg, failedTypes.length > 0);

      } catch (fatalError) {
          console.error("Fatal Magic Error:", fatalError);
          showToast(translationService.t('common.error'), true);
      } finally {
          this._isLoading = false;
          this._magicStatus = '';
          this._wizardMode = false;
          this._activeTool = null;
          this.requestUpdate();
      }
  }

  // ... rest of the file (methods after _handleAutoMagic)
  
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
                      ${this._renderContentCard('audio', '🎙️', translationService.t('content_types.audio'), false)}
                      ${this._renderContentCard('comic', '💬', translationService.t('content_types.comic'), false)}
                      ${this._renderContentCard('flashcards', '🃏', translationService.t('content_types.flashcards'), false)}
                      ${this._renderContentCard('mindmap', '🧠', translationService.t('content_types.mindmap'), false)}
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

  _renderSpecificEditor() {
      const handleUpdate = (e) => {
          this.lesson = { ...this.lesson, ...e.detail };
          this.requestUpdate(); 
      };

      const editorProps = (extraListeners = {}) => ({
          id: "active-editor",
          class: "w-full h-full block",
          lesson: this.lesson,
          isSaving: this.isSaving,
          ...extraListeners
      });

      switch (this._activeTool) {
          case 'text': 
              return html`<editor-view-text @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${handleUpdate} 
                  id="active-editor" class="w-full h-full block"></editor-view-text>`;
          
          case 'presentation': 
              return html`<editor-view-presentation @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${(e) => { this.lesson = { ...this.lesson, presentation: e.detail }; }} 
                  id="active-editor" class="w-full h-full block"></editor-view-presentation>`;
          
          case 'quiz': 
              return html`<editor-view-quiz @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${(e) => { this.lesson = { ...this.lesson, quiz: e.detail }; }} 
                  id="active-editor" class="w-full h-full block"></editor-view-quiz>`;
          
          case 'test': 
              return html`<editor-view-test @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${(e) => { this.lesson = { ...this.lesson, ...e.detail }; }} 
                  id="active-editor" class="w-full h-full block"></editor-view-test>`;
          
          case 'post': 
              return html`<editor-view-post @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @update=${(e) => { this.lesson = { ...this.lesson, content: e.detail.content }; }} 
                  id="active-editor" class="w-full h-full block"></editor-view-post>`;
          
          case 'video': 
              return html`<editor-view-video @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${handleUpdate} 
                  id="active-editor" class="w-full h-full block"></editor-view-video>`;
          
          case 'comic': 
              return html`<editor-view-comic @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${(e) => { this.lesson = { ...this.lesson, comic: e.detail.comic }; }} 
                  id="active-editor" class="w-full h-full block"></editor-view-comic>`;
          
          case 'flashcards': 
              return html`<editor-view-flashcards @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${(e) => { this.lesson = { ...this.lesson, flashcards: e.detail }; }} 
                  id="active-editor" class="w-full h-full block"></editor-view-flashcards>`;
          
          case 'mindmap': 
              return html`<editor-view-mindmap @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${(e) => { this.lesson = { ...this.lesson, mindmap: e.detail.mindmap }; }} 
                  id="active-editor" class="w-full h-full block"></editor-view-mindmap>`;

          case 'audio':
              return html`<editor-view-audio @back=${this._handleBackToHub} @save=${this._handleSave}
                  .lesson=${this.lesson} .isSaving=${this.isSaving}
                  @lesson-updated=${(e) => { this.lesson = { ...this.lesson, content: e.detail.content }; }} 
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
          return this._renderSpecificToolEditor();
      }
      return this._renderLessonHub();
  }
}
customElements.define('lesson-editor', LessonEditor);
