import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { BaseView } from './base-view.js';
import { doc, getDoc, updateDoc, setDoc, collection, getDocs, where, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, getDownloadURL, uploadString } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, auth, functions, storage } from '../../firebase-init.js';
import { showToast } from '../../utils.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { translationService } from '../../utils/translation-service.js';
import { callGenerateImage } from '../../gemini-api.js';

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

import { getSelectedFiles, clearSelectedFiles } from '../../upload-handler.js';

// --- HELPER: Normalize to GS URL ---
function _normalizeToGsUrl(fileObj) {
    if (!fileObj) return null;
    const bucket = storage.app.options.storageBucket || "ai-sensei-czu-pilot.firebasestorage.app";
    let path = fileObj.storagePath || fileObj.fullPath || fileObj.path;

    if (!path) return null;
    if (path.startsWith('gs://')) return path;
    if (path.startsWith('/')) path = path.substring(1);

    return `gs://${bucket}/${path}`;
}

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
    _loadError: { state: true, type: Boolean }
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
  }

  async connectedCallback() {
    super.connectedCallback();
    const urlParams = new URLSearchParams(window.location.search);
    this.lessonId = urlParams.get('id');

    // Timeout safety for infinite loading
    this._loadingTimeout = setTimeout(() => {
        if (!this.lesson && this._wizardMode) {
            console.warn("Safety timeout: Force-initializing lesson");
            this._loadError = true;
            this.requestUpdate();
        }
    }, 5000);

    if (this.lessonId) {
      this._wizardMode = false;
      await this._loadLesson(this.lessonId);
    } else {
      this._initNewLesson();
    }
  }

  async updated(changedProperties) {
      if (this.lesson && this._loadingTimeout) {
          clearTimeout(this._loadingTimeout);
          this._loadingTimeout = null;
      }
  }

  _initNewLesson() {
    // Check global uploads
    const globalFiles = getSelectedFiles();
    if (globalFiles && globalFiles.length > 0) {
        this._uploadedFiles = [...globalFiles];
        clearSelectedFiles();
    }

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
      status: 'draft'
    };
    this._wizardMode = true;
    this.requestUpdate();
  }

  async _loadLesson(id) {
      try {
          const user = auth.currentUser;
          if (!user) return;
          // Updated query with ownerId for security rules
          const q = query(collection(db, 'lessons'), where('id', '==', id), where('ownerId', '==', user.uid));
          const snapshot = await getDocs(q);

          if (!snapshot.empty) {
              this.lesson = snapshot.docs[0].data();
              this._wizardMode = false;
          } else {
              console.error("Lesson not found or permission denied");
              this._loadError = true;
          }
      } catch (e) {
          console.error("Error loading lesson:", e);
          this._loadError = true;
      }
  }

  async _handleAutoMagic() {
      if (!this.lesson.title) {
          showToast(translationService.t('professor.editor.title_required'), true);
          return;
      }

      // 1. Prepare Files with GS:// format
      const filePaths = this._uploadedFiles
          .map(_normalizeToGsUrl)
          .filter(p => p !== null);

      console.log("🚀 AutoMagic Payload Files:", filePaths);

      // Allow generation without files IF there is existing text, otherwise warn
      if (filePaths.length === 0 && !this.lesson.text_content) {
           console.warn("No files and no text content. AI might fail.");
      }

      this._isLoading = true;

      try {
          // Save Draft First
          if (!this.lesson.id) {
             const newRef = doc(collection(db, 'lessons'));
             this.lesson.id = newRef.id;
             this.lesson.ownerId = auth.currentUser.uid;
          }
          await this._handleSave();
          this._wizardMode = false;
          this.requestUpdate(); 

          // Define Workload
          const types = ['text', 'presentation', 'quiz', 'test', 'post', 'flashcards', 'mindmap', 'comic', 'audio'];
          let successCount = 0;
          let failedTypes = [];

          // --- PHASE 1: TEXT GENERATION (Priority) ---
          // We must generate text first so other components can use it as source
          let generatedContextText = this.lesson.text_content || '';

          if (types.includes('text')) {
              this._magicStatus = `Generating Core Text...`;
              this.requestUpdate();

              try {
                  const result = await this._callAiGeneration('text', this.lesson.title, null, filePaths);
                  // Result might be object {text_content: "..."} or string
                  generatedContextText = result.text_content || result.text || (typeof result === 'string' ? result : JSON.stringify(result));

                  this.lesson.text_content = generatedContextText;
                  await this._handleSave();
                  successCount++;
              } catch (e) {
                  console.error("Text Gen Failed:", e);
                  failedTypes.push('text');
              }
          }

          // --- PHASE 2: DERIVATIVES (Dependent on Text) ---
          for (const type of types) {
              if (type === 'text') continue; // Skip, already done

              this._magicStatus = `Generating ${type.toUpperCase()}...`;
              this.requestUpdate();

              try {
                  // PASS SOURCE TEXT explicitly so backend doesn't complain about missing files
                  const result = await this._callAiGeneration(type, this.lesson.title, generatedContextText, filePaths);

                  // Handle Specific Types
                  if (type === 'quiz') this.lesson.quiz = { questions: result.questions || result };
                  if (type === 'test') this.lesson.test = { questions: result.questions || result };
                  if (type === 'post') this.lesson.post = result;
                  if (type === 'flashcards') this.lesson.flashcards = result.flashcards || result;
                  if (type === 'mindmap') this.lesson.mindmap = result;

                  if (type === 'presentation') {
                      let slides = result.slides || result;
                      this.lesson.presentation = { slides: slides, styleId: 'default' };
                      // Async image gen - don't await blocking
                      this._generateImagesForSlides(slides).then(() => this._handleSave());
                  }

                  if (type === 'comic') {
                      let panels = result.panels || result;
                      this.lesson.comic = { panels: panels };
                      this._generateImagesForComic(panels).then(() => this._handleSave());
                  }

                  await this._handleSave();
                  successCount++;
              } catch (e) {
                  console.warn(`Failed ${type}:`, e);
                  failedTypes.push(type);
              }
          }

          showToast(`Magic Done! Success: ${successCount}, Failed: ${failedTypes.length}`);

      } catch (fatalError) {
          console.error("Fatal Magic Error:", fatalError);
          showToast(fatalError.message, true);
      } finally {
          this._isLoading = false;
          this._magicStatus = '';
          this.requestUpdate();
      }
  }

  // --- HELPER: Centralized AI Call ---
  async _callAiGeneration(type, title, sourceText, filePaths) {
      const generateContentFunc = httpsCallable(functions, 'generateContent');

      let promptData = {
          userPrompt: `Create ${type} for ${title}`,
          isMagic: true,
          language: this.lesson.language || 'cs'
      };

      const result = await generateContentFunc({
          contentType: type,
          promptData: promptData,
          filePaths: filePaths, // GS Paths
          sourceText: sourceText // Explicit context
      });

      let data = result.data;

      // Parse JSON string if needed
      if (typeof data === 'string') {
          // Strip Markdown
          const clean = data.replace(/^```json\s*|\s*```$/g, '').trim();
          try {
              data = JSON.parse(clean);
          } catch (e) {
              // Check for Error Strings in raw text
              const lower = clean.toLowerCase();
              if (lower.includes('"error"') || lower.includes('"chyba"') || lower.includes('nebyl poskytnut')) {
                  throw new Error("AI returned error message: " + clean.substring(0, 100));
              }
              // Return raw string if it's just text content
              return clean;
          }
      }

      // Check for structured error
      if (data && (data.error || data.chyba)) {
          throw new Error(data.message || data.zpráva || data.error || "Backend Error");
      }

      return data;
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
              } catch (e) {
                  console.warn("Image gen failed for slide", i, e);
              }
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
              } catch (e) {
                  console.warn("Image gen failed for panel", i, e);
              }
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

  // Basic Render
  render() {
      if (this._loadError) {
          return html`<div class="p-8 text-center text-red-500">
              <h3>Error loading lesson</h3>
              <button class="btn-primary mt-4" @click="${() => location.reload()}">Reload</button>
          </div>`;
      }

      if (this._wizardMode) {
          return this._renderWizard();
      }

      if (!this.lesson) {
          return html`<div class="flex items-center justify-center h-screen"><div class="loading-spinner"></div></div>`;
      }

      return html`
        <div class="h-screen flex flex-col bg-gray-50">
            <professor-header-editor
                .lesson="${this.lesson}"
                .isSaving="${this.isSaving}"
                @save="${this._handleSave}"
                @back="${() => window.location.href = '/professor/dashboard'}">
            </professor-header-editor>

            <div class="flex-1 flex overflow-hidden">
                <div class="w-64 bg-white border-r overflow-y-auto">
                    ${this._renderSidebar()}
                </div>

                <div class="flex-1 overflow-y-auto p-8">
                    ${this._isLoading ? html`
                        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                            <div class="bg-white p-6 rounded-lg shadow-xl text-center">
                                <div class="loading-spinner mb-4"></div>
                                <p class="text-lg font-medium">${this._magicStatus || 'Processing...'}</p>
                            </div>
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
      <div class="fixed inset-0 bg-gray-100 z-50 flex items-center justify-center p-4">
          <div class="bg-white rounded-xl shadow-2xl max-w-4xl w-full p-8">
              <h2 class="text-3xl font-bold mb-6 text-gray-800 text-center">
                  ${translationService.t('editor.wizard.title') || 'Create New Lesson'}
              </h2>

              <div class="space-y-6">
                  <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">Lesson Title</label>
                      <input type="text"
                          class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
                          .value="${this.lesson?.title || ''}"
                          @input="${(e) => this.lesson.title = e.target.value}"
                          placeholder="e.g., Introduction to Quantum Physics">
                  </div>

                  <div class="bg-blue-50 p-4 rounded-lg border border-blue-100">
                      <h3 class="font-semibold text-blue-800 mb-2">Selected Files</h3>
                      ${this._uploadedFiles.length > 0 ? html`
                          <ul class="space-y-2">
                              ${this._uploadedFiles.map(f => html`
                                  <li class="flex items-center text-sm text-blue-700">
                                      <span class="mr-2">📄</span> ${f.name || 'Unknown File'}
                                  </li>
                              `)}
                          </ul>
                      ` : html`
                          <div class="text-center py-4">
                              <p class="text-blue-600 mb-2">No files selected from Dashboard.</p>
                              <button class="text-sm underline text-blue-800" @click="${() => window.location.href = '/professor/dashboard'}">
                                  Go back to upload
                              </button>
                          </div>
                      `}
                  </div>

                  <div class="flex gap-4 pt-4">
                      <button @click="${() => window.location.href = '/professor/dashboard'}"
                          class="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">
                          Cancel
                      </button>

                      <button @click="${this._handleAutoMagic}"
                          class="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 font-bold shadow-lg transform transition hover:scale-105 flex items-center justify-center gap-2">
                          <span>✨</span> AutoMagic Create
                      </button>
                  </div>
              </div>
          </div>
      </div>`;
  }

  _renderSidebar() {
      const sections = [
          { id: 'text', label: 'Text Content', icon: '📝' },
          { id: 'presentation', label: 'Presentation', icon: '📊' },
          { id: 'quiz', label: 'Quiz', icon: '❓' },
          { id: 'test', label: 'Final Test', icon: '📝' },
          { id: 'flashcards', label: 'Flashcards', icon: '🃏' },
          { id: 'comic', label: 'Comics', icon: '💬' },
          // Add other sections...
      ];

      return html`
          <nav class="p-4 space-y-1">
              ${sections.map(section => html`
                  <button
                      @click="${() => this._activeSection = section.id}"
                      class="w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors
                      ${this._activeSection === section.id
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-50'}">
                      <span class="mr-3 text-xl">${section.icon}</span>
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
          default: return html`<div class="text-center text-gray-500 mt-20">Select a section to edit</div>`;
      }
  }
}

customElements.define('lesson-editor', LessonEditor);