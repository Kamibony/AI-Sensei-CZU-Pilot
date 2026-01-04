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

  // --- LOGIC: NORMALIZATION FIX ---
  _normalizeToGsUrl(fileObj) {
      if (!fileObj) return null;
      const bucket = storage.app.options.storageBucket || "ai-sensei-czu-pilot.firebasestorage.app";
      // Handle various property names from different upload flows
      let path = fileObj.storagePath || fileObj.fullPath || fileObj.path;

      if (!path) return null;
      if (path.startsWith('gs://')) return path;
      if (path.startsWith('/')) path = path.substring(1);

      return `gs://${bucket}/${path}`;
  }

  // --- LOGIC: AI CALLER FIX ---
  async _callAiGeneration(type, title, sourceText, filePaths) {
      const generateContentFunc = httpsCallable(functions, 'generateContent');

      const result = await generateContentFunc({
          contentType: type,
          promptData: {
              userPrompt: `Create ${type} for ${title}`,
              isMagic: true,
              language: this.lesson.language || 'cs'
          },
          filePaths: filePaths,
          sourceText: sourceText // Pass context to prevent "No source text" error
      });

      let data = result.data;
      // Parse if string (handling Markdown pollution)
      if (typeof data === 'string') {
          const clean = data.replace(/^```json\s*|\s*```$/g, '').trim();
          try {
              data = JSON.parse(clean);
          } catch (e) {
              // If parse fails, check if it's an error message
              const lower = clean.toLowerCase();
              if (lower.includes('"error"') || lower.includes('nebyl poskytnut') || lower.includes('no source')) {
                  throw new Error("AI Error: " + clean.substring(0, 100));
              }
              return clean; // It's valid raw text
          }
      }
      // Check structured error
      if (data && (data.error || data.chyba)) {
          throw new Error(data.message || data.zpráva || data.error);
      }
      return data;
  }

  async connectedCallback() {
    super.connectedCallback();
    const urlParams = new URLSearchParams(window.location.search);
    this.lessonId = urlParams.get('id');

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
          const q = query(collection(db, 'lessons'), where('id', '==', id), where('ownerId', '==', user.uid));
          const snapshot = await getDocs(q);

          if (!snapshot.empty) {
              this.lesson = snapshot.docs[0].data();
              this._wizardMode = false;
          } else {
              this._loadError = true;
          }
      } catch (e) {
          console.error("Error loading lesson:", e);
          this._loadError = true;
      }
  }

  // --- LOGIC: SEQUENTIAL AUTOMAGIC FIX ---
  async _handleAutoMagic() {
      if (!this.lesson.title) {
          showToast(translationService.t('professor.editor.title_required') || "Title required", true);
          return;
      }

      // 1. Prepare Paths
      const filePaths = this._uploadedFiles
          .map(f => this._normalizeToGsUrl(f))
          .filter(p => p !== null);

      console.log("🚀 Magic Payload:", filePaths);

      this._isLoading = true;
      this.requestUpdate();

      try {
          if (!this.lesson.id) {
             const newRef = doc(collection(db, 'lessons'));
             this.lesson.id = newRef.id;
             this.lesson.ownerId = auth.currentUser.uid;
          }
          await this._handleSave();

          const types = ['text', 'presentation', 'quiz', 'test', 'post', 'flashcards', 'mindmap', 'comic'];
          let generatedText = this.lesson.text_content || '';
          let successCount = 0;

          // --- PHASE 1: TEXT ---
          if (types.includes('text')) {
              this._magicStatus = "Generuji Text...";
              this.requestUpdate();
              try {
                  const res = await this._callAiGeneration('text', this.lesson.title, null, filePaths);
                  generatedText = res.text_content || res.text || (typeof res === 'string' ? res : JSON.stringify(res));
                  this.lesson.text_content = generatedText;
                  await this._handleSave();
                  successCount++;
              } catch (e) {
                  console.error("Text failed:", e);
              }
          }

          // --- PHASE 2: DEPENDENTS ---
          for (const type of types) {
              if (type === 'text') continue;

              this._magicStatus = `Generuji ${type}...`;
              this.requestUpdate();

              try {
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

          showToast(`Magie dokončena! (${successCount} sekcí)`, false);
          this._wizardMode = false;

      } catch (e) {
          console.error("Magic fatal:", e);
          showToast("Chyba: " + e.message, true);
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

  // --- VISUALS: RESTORED UI ---
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
                                      <span class="mr-2">📄</span> ${f.name || 'File'}
                                  </li>
                              `)}
                          </ul>
                      ` : html`
                          <div class="text-center py-4">
                              <p class="text-blue-600 mb-2">No files selected.</p>
                              <button class="text-sm underline text-blue-800" @click="${() => window.location.href = '/professor/dashboard'}">
                                  Upload from Dashboard
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
          { id: 'mindmap', label: 'Mind Map', icon: '🧠' },
          { id: 'post', label: 'Social Post', icon: '📰' }
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
          case 'mindmap': return html`<editor-view-mindmap .lesson="${this.lesson}"></editor-view-mindmap>`;
          case 'post': return html`<editor-view-post .lesson="${this.lesson}"></editor-view-post>`;
          default: return html`<div class="text-center text-gray-500 mt-20">Select a section to edit</div>`;
      }
  }
}

customElements.define('lesson-editor', LessonEditor);