import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { BaseView } from './base-view.js';
import { doc, getDoc, updateDoc, setDoc, arrayUnion, arrayRemove, collection, getDocs, where, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, getDownloadURL, uploadString } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, auth, functions, storage } from '../../firebase-init.js';
import { showToast } from '../../utils.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
// OPRAVENÝ IMPORT (používame utils verziu)
import { translationService } from '../../utils/translation-service.js';
import { callGenerateContent, callGenerateImage } from '../../gemini-api.js';

// Importy všetkých editorov
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
    _magicStatus: { state: true, type: String }
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
  }

  updated(changedProperties) {
    if (changedProperties.has('lesson')) {
      if (this.lesson) {
        this._selectedClassIds = this.lesson.assignedToGroups || [];
        this._uploadedFiles = this.lesson.files || [];
      } else {
        this._selectedClassIds = [];
        this._uploadedFiles = [];
        // Only init if lesson is strictly undefined (not just during lit lifecycle updates)
        if (changedProperties.get('lesson') !== undefined && this.lesson === undefined) {
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

      if (!this.lesson) {
          this._initNewLesson();
      } else if (this.lesson.id) {
          // If we have an existing lesson, start in Hub mode
          this._wizardMode = false;
      }
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      this.removeEventListener('lesson-updated', this._handleLessonUpdatedEvent);
      if (this._unsubscribe) this._unsubscribe();
      if (this._authUnsubscribe) this._authUnsubscribe();
  }

  _handleLessonUpdatedEvent(e) {
      if (e.detail) {
          this.lesson = { ...this.lesson, ...e.detail };
          this.requestUpdate();
      }
  }

  _initNewLesson() {
      this.lesson = {
          title: '',
          subject: '',
          topic: '',
          contentType: 'text',
          content: { blocks: [] },
          assignedToGroups: [],
          status: 'draft',
          files: [],
          createdAt: new Date().toISOString()
      };
      this._wizardMode = true;
      this._activeTool = null;
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
        files: this._uploadedFiles,
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

  _handleBackToHub() {
      this._activeTool = null; // Return to Hub
      this.requestUpdate();
  }

  _handleBackClick() {
      if (this._activeTool) {
          this._handleBackToHub();
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
      // Update local lesson state immediately for UI consistency
      if (this.lesson) {
          this.lesson = { ...this.lesson, assignedToGroups: this._selectedClassIds };
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
                   this.lesson = { ...this.lesson, files: this._uploadedFiles };
                   if(this.lesson.title) await this._handleSave();
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

  async _handleAutoMagic() {
      // 1. Validácia
      if (!this.lesson.title) {
          showToast(translationService.t('professor.editor.title_required'), true);
          return;
      }

      this._isLoading = true;
      
      // 2. Bezpečné uloženie základu (potrebujeme ID pre názvy súborov)
      try {
          await this._handleSave();
      } catch (e) {
          console.error("Save failed before magic:", e);
          showToast("Nepodařilo se uložit lekci před generováním.", true);
          this._isLoading = false;
          return;
      }

      // Definícia typov obsahu
      const types = ['text', 'presentation', 'quiz', 'test', 'post', 'flashcards', 'mindmap', 'comic'];
      
      // Získame cesty k RAG súborom
      const filePaths = this._uploadedFiles ? this._uploadedFiles.map(f => f.storagePath).filter(Boolean) : [];

      let successCount = 0;
      let failedTypes = [];

      try {
          // Hlavná slučka cez typy obsahu
          for (const type of types) {
             try {
                // UI UPDATE: Informujeme o progrese
                this._magicStatus = `${translationService.t('common.magic_status_generating') || 'Generuji'} (${successCount + failedTypes.length + 1}/${types.length}): ${(translationService.t(`content_types.${type}`) || type).toUpperCase()}...`;
                this.requestUpdate();

                let promptData = { userPrompt: '', isMagic: true };
                let contentType = type;

                // --- A. Textová príprava (Prompty) ---
                switch (type) {
                    case 'text':
                        promptData.userPrompt = `Vytvor podrobný výukový text na tému '${this.lesson.title}' ${this.lesson.topic ? `(${this.lesson.topic})` : ''}. Rozdeľ na úvod, hlavné body a záver.`;
                        break;
                    case 'presentation':
                        promptData.userPrompt = `Vytvor štruktúru prezentácie (8 slidov) na tému '${this.lesson.title}'. Pre každý slide navrhni stručné body a vizuálny nápad (visual_idea) pre obrázok.`;
                        promptData.slide_count = 8;
                        break;
                    case 'quiz':
                        promptData.question_count = 5;
                        promptData.userPrompt = `Vytvor kvíz (5 otázek) na tému '${this.lesson.title}'.`;
                        break;
                    case 'test':
                        promptData.question_count = 10;
                        promptData.difficulty = 'Střední';
                        promptData.userPrompt = `Vytvor test (10 otázek) na tému '${this.lesson.title}'.`;
                        break;
                    case 'post':
                        promptData.episode_count = 3;
                        promptData.userPrompt = `Vytvor scenár pre podcast (3 krátke epizódy) na tému '${this.lesson.title}'.`;
                        break;
                    case 'flashcards':
                        promptData.userPrompt = `Vytvoř 10 studijních kartiček (pojem-definice) na téma '${this.lesson.title}'.`;
                        break;
                    case 'mindmap':
                        promptData.userPrompt = `Vytvoř hierarchickou mentální mapu (Mermaid JSON) na téma '${this.lesson.title}'.`;
                        break;
                    case 'comic':
                        promptData.userPrompt = `Vytvoř scénář komiksu (4 panely) na téma '${this.lesson.title}'. Pro každý panel detailně popiš scénu (description).`;
                        break;
                }

                // Volanie AI pre textový základ
                const generateContentFunc = httpsCallable(functions, 'generateContent');
                const result = await generateContentFunc({
                    contentType: contentType,
                    promptData: promptData,
                    filePaths: filePaths
                });
                
                // Kópia dát pre úpravy
                let data = JSON.parse(JSON.stringify(result.data));

                // --- B. Multimediálne dopočítavanie (Audio & Obraz) ---
                // REFAKTOR: Sekvenčné spracovanie pre zníženie záťaže API a upload na Storage

                // 1. PODCAST AUDIO (Sekvenčné)
                if (type === 'post' && data.podcast_series && data.podcast_series.episodes) {
                    this._magicStatus = `🎙️ Generuji audio pro podcast...`;
                    this.requestUpdate();
                    
                    const generateAudioFunc = httpsCallable(functions, 'generatePodcastAudio');
                    
                    for (const [index, ep] of data.podcast_series.episodes.entries()) {
                         if (!ep.script) continue;
                         try {
                            const audioResult = await generateAudioFunc({
                                lessonId: this.lesson.id,
                                text: ep.script,
                                episodeIndex: index,
                                language: 'cs-CZ'
                            });
                            
                            if (audioResult.data && audioResult.data.storagePath) {
                                const storageRef = ref(storage, audioResult.data.storagePath);
                                // Ensure we wait for the URL
                                const url = await getDownloadURL(storageRef);
                                data.podcast_series.episodes[index] = {
                                    ...ep,
                                    audioUrl: url,
                                    storagePath: audioResult.data.storagePath
                                };
                            }
                         } catch (err) {
                             console.warn(`[AutoMagic] Audio gen failed for ep ${index}:`, err);
                         }
                    }
                }

                // 2. PREZENTÁCIA OBRÁZKY (Sekvenčné + Upload)
                if (type === 'presentation' && data.slides) {
                    this._magicStatus = `🎨 Generuji obrázky pro slidy...`;
                    this.requestUpdate();

                    for (const [index, slide] of data.slides.entries()) {
                        if (slide.visual_idea) {
                            try {
                                const imgResult = await callGenerateImage(slide.visual_idea);
                                const base64Data = imgResult.imageBase64 || imgResult;

                                if (base64Data && typeof base64Data === 'string' && base64Data.length > 100) {
                                     // UPLOAD TO STORAGE
                                     const fileName = `slide_${Date.now()}_${index}.png`;
                                     const storagePath = `courses/${auth.currentUser.uid}/media/generated/${fileName}`;

                                     const url = await this._uploadBase64Image(base64Data, storagePath);

                                     data.slides[index] = {
                                         ...slide,
                                         imageUrl: url,
                                         backgroundImage: undefined // Clean up
                                     };
                                }
                            } catch (err) {
                                console.warn(`[AutoMagic] Image gen failed for slide ${index}:`, err);
                            }
                            // Spomalenie kvôli API limitom
                            await delay(2000);
                        }
                    }
                }

                // 3. KOMIKS OBRÁZKY (Sekvenčné + Upload)
                if (type === 'comic' && data.panels) {
                    this._magicStatus = `🖍️ Kreslím komiks...`;
                    this.requestUpdate();

                    for (const [index, panel] of data.panels.entries()) {
                         if (panel.description) {
                            try {
                                const imgResult = await callGenerateImage(`Comic book style, ${panel.description}`);
                                const base64Data = imgResult.imageBase64 || imgResult;

                                if (base64Data && typeof base64Data === 'string') {
                                     const fileName = `comic_${Date.now()}_${index}.png`;
                                     const storagePath = `courses/${auth.currentUser.uid}/media/generated/${fileName}`;

                                     const url = await this._uploadBase64Image(base64Data, storagePath);

                                     data.panels[index] = {
                                         ...panel,
                                         imageUrl: url
                                     };
                                }
                            } catch (err) {
                                console.warn(`[AutoMagic] Comic gen failed for panel ${index}:`, err);
                            }
                            // Spomalenie kvôli API limitom
                            await delay(2000);
                         }
                    }
                }

                // --- C. Uloženie do stavu lekcie ---
                switch (type) {
                    case 'text':
                        this.lesson = { ...this.lesson, text_content: data.text || data };
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
                        this.lesson = {
                            ...this.lesson,
                            postContent: data,
                            content: { text: textRep, author: 'ai_sensei' }
                        };
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
                }

                // Priebežné uloženie do DB po každom type
                await this._handleSave(); 
                successCount++;

             } catch (error) {
                 console.error(`Failed to generate ${type}:`, error);
                 failedTypes.push(type);
             }
          }

          // Hotovo
          const msg = `Magie dokončena! Úspěch: ${successCount}/${types.length}.` +
                      (failedTypes.length ? ` Chyby: ${failedTypes.join(', ')}` : '');
          showToast(msg, failedTypes.length > 0);

      } catch (fatalError) {
          console.error("Fatal Magic Error:", fatalError);
          showToast(translationService.t('common.error'), true);
      } finally {
          this._isLoading = false;
          this._magicStatus = '';
          this._wizardMode = false;
          this._activeTool = null; // Prechod na Hub
          this.requestUpdate();
      }
  }

  async _handleManualCreate() {
      if (!this.lesson.title) {
          showToast(translationService.t('professor.editor.title_required'), true);
          return;
      }
      await this._handleSave();
      this._wizardMode = false;
      this._activeTool = null; // Go to Hub
      this.requestUpdate();
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
                <h2 class="text-2xl font-bold text-slate-800 animate-pulse">✨ AI Sensei kouzlí...</h2>
                <p class="text-slate-500 mt-2">${this._magicStatus || 'Generuji veškerý obsah lekce. Může to chvíli trvat.'}</p>
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

            <div class="w-full max-w-3xl bg-white rounded-3xl shadow-xl flex flex-col max-h-[90vh] animate-fade-in-up">

                <div class="bg-gradient-to-r from-indigo-600 to-violet-600 p-8 text-white relative overflow-hidden flex-shrink-0">
                    <button @click="${this._handleBackClick}" class="absolute left-4 top-4 p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                         <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                    </button>
                    <div class="relative z-10 text-center mt-4">
                        <h2 class="text-3xl font-extrabold mb-2">✨ ${translationService.t('lesson.new') || 'Nová lekce'}</h2>
                        <p class="text-indigo-100">${translationService.t('professor.editor.magic_generator_desc') || 'Vytvořte lekci rychle pomocí AI nebo manuálně'}</p>
                    </div>
                    <div class="absolute right-0 top-0 h-full w-1/2 bg-white/10 transform skew-x-12 translate-x-12"></div>
                </div>

                <div class="p-8 space-y-6 overflow-y-auto custom-scrollbar">
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-bold text-slate-700 mb-2">
                                ${translationService.t('professor.editor.title') || 'Název lekce'} <span class="text-red-500">*</span>
                            </label>
                            <input type="text"
                                .value="${this.lesson.title}"
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
                                    placeholder="Např. Dějepis">
                                <datalist id="subjects-list">
                                    ${this._availableSubjects.map(sub => html`<option value="${sub}"></option>`)}
                                </datalist>
                             </div>
                             <div>
                                <label class="block text-sm font-bold text-slate-700 mb-2">${translationService.t('professor.editor.subtitle')}</label>
                                <input type="text"
                                    .value="${this.lesson.topic}"
                                    @input="${e => this.lesson = { ...this.lesson, topic: e.target.value }}"
                                    class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                    placeholder="${translationService.t('professor.editor.subtitlePlaceholder')}">
                             </div>
                        </div>
                    </div>

                    ${this._renderFilesSection()}

                    <div class="mt-8 pt-6 border-t border-slate-100 flex justify-end gap-4">
                        <button @click=${this._handleManualCreate} class="px-6 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors">
                           🛠️ ${translationService.t('professor.manual_create')}
                        </button>
                        <button @click=${this._handleAutoMagic} class="px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all">
                           ✨ ${translationService.t('lesson.magic_btn')}
                        </button>
                    </div>

                </div>
            </div>
        </div>
      `;
  }

  _renderFilesSection() {
      return html`
        <div class="bg-slate-50 rounded-2xl p-6 border border-slate-100">
             <div class="flex items-center justify-between mb-4">
                <h3 class="font-bold text-slate-700 flex items-center gap-2">
                    📚 ${translationService.t('professor.editor.filesAndRag')}
                </h3>
                 <div class="flex gap-2">
                    <button @click="${this._handleOpenLibrary}" class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors">
                        📂 ${translationService.t('common.files_library')}
                    </button>
                    <label class="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
                        📤 ${translationService.t('media.upload_title')}
                        <input type="file" multiple accept=".pdf,.docx,.txt" class="hidden" @change="${this._handleFilesSelected}" ?disabled="${this._uploading}">
                    </label>
                 </div>
             </div>
             ${this._uploadedFiles.length === 0 ? html`
                <div class="text-center p-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
                    <p class="text-sm">${translationService.t('common.files_rag_help')}</p>
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
      `;
  }

  _renderLessonHub() {
      if (this._isLoading) {
          return html`
             <div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
                <div class="spinner w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <h2 class="text-2xl font-bold text-slate-800 animate-pulse">✨ AI Sensei kouzlí...</h2>
                <p class="text-slate-500 mt-2">Generuji veškerý obsah lekce. Může to chvíli trvat.</p>
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
                        ✨ ${translationService.t('professor.hub_subtitle') || 'Obsah lekce'}
                     </h3>
                  </div>

                  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      ${this._renderContentCard('text', '📝', translationService.t('content_types.text'), this.lesson.text_content || (this.lesson.content?.blocks?.length > 0))}
                      ${this._renderContentCard('presentation', '📊', translationService.t('content_types.presentation'), this.lesson.slides?.length > 0 || this.lesson.presentation?.slides?.length > 0)}
                      ${this._renderContentCard('quiz', '❓', translationService.t('content_types.quiz'), this.lesson.questions?.length > 0 || this.lesson.quiz?.questions?.length > 0)}
                      ${this._renderContentCard('test', '📝', translationService.t('content_types.test'), this.lesson.test?.questions?.length > 0)}
                      ${this._renderContentCard('post', '📰', translationService.t('content_types.post') || 'Příspěvek', !!this.lesson.postContent)}
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
                    Hotovo
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
                        <span>${this.lesson.subject || 'Bez předmětu'}</span>
                        <span>•</span>
                        <span>${this.lesson.topic || 'Bez tématu'}</span>
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
      // Helper na spracovanie eventu 'lesson-updated'
      const handleUpdate = (e) => {
          this.lesson = { ...this.lesson, ...e.detail };
          this.requestUpdate(); 
      };

      // DÔLEŽITÉ: class="w-full h-full block" zabezpečí, že sa editor roztiahne
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
