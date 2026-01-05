import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { BaseView } from './base-view.js';
import { doc, getDoc, updateDoc, setDoc, collection, getDocs, where, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, getDownloadURL, uploadString, uploadBytes } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { db, auth, functions, storage } from '../../firebase-init.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
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
    _loadError: { state: true, type: Boolean },
    _availableClasses: { state: true, type: Array },
    _selectedClassId: { state: true, type: String },
    _currentUser: { state: true, type: Object }
  };

  constructor() {
    super();
    this.lesson = null;
    this.lessonId = null;
    this._uploadedFiles = [];
    this._wizardMode = true;
    this._magicStatus = '';
    this._activeSection = 'overview';
    this._availableClasses = [];
    this._selectedClassId = '';
    this._currentUser = null;
  }

  // --- 1. SAFE AUTH INITIALIZATION ---
  connectedCallback() {
    super.connectedCallback();
    const urlParams = new URLSearchParams(window.location.search);
    this.lessonId = urlParams.get('id');

    // Wait for Auth to be ready
    this._authUnsubscribe = onAuthStateChanged(auth, (user) => {
        if (user) {
            this._currentUser = user;
            this._fetchClasses(user.uid);

            if (this.lessonId) {
                this._wizardMode = false;
                this._loadLesson(this.lessonId, user.uid);
            } else {
                this._initNewLesson();
            }
        } else {
            // Handle logged out state if needed
            window.location.href = '/';
        }
    });
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      if (this._authUnsubscribe) this._authUnsubscribe();
  }

  // --- 2. BACKEND LOGIC (PRESERVED) ---
  _normalizeToGsUrl(fileObj) {
      if (!fileObj) return null;
      const bucket = storage.app.options.storageBucket || "ai-sensei-czu-pilot.firebasestorage.app";
      let path = fileObj.storagePath || fileObj.fullPath || fileObj.path;
      if (!path) return null;
      if (path.startsWith('gs://')) return path;
      if (path.startsWith('/')) path = path.substring(1);
      return `gs://${bucket}/${path}`;
  }

  async _callAiGeneration(type, title, sourceText, filePaths) {
      const generateContentFunc = httpsCallable(functions, 'generateContent');
      const result = await generateContentFunc({
          contentType: type,
          promptData: {
              userPrompt: `Create ${type} for ${title}`,
              isMagic: true,
              language: translationService.currentLanguage || 'cs'
          },
          filePaths: filePaths,
          sourceText: sourceText
      });

      let data = result.data;
      if (typeof data === 'string') {
          const clean = data.replace(/^```json\s*|\s*```$/g, '').trim();
          try { data = JSON.parse(clean); }
          catch (e) {
              const lower = clean.toLowerCase();
              if (lower.includes('"error"') || lower.includes('nebyl poskytnut') || lower.includes('no source')) {
                  throw new Error((translationService.t('common.magic_error') || "AI Error") + ": " + clean.substring(0, 50));
              }
              return clean;
          }
      }
      if (data && (data.error || data.chyba)) {
          throw new Error(data.message || data.zpráva || data.error);
      }
      return data;
  }

  // --- 3. DATA LOADING ---
  async _fetchClasses(uid) {
      try {
          const q = query(collection(db, 'classes'), where('ownerId', '==', uid));
          const snapshot = await getDocs(q);
          this._availableClasses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) { console.warn("Classes fetch error", e); }
  }

  _initNewLesson() {
    // Import files passed from Dashboard
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
      status: 'draft',
      classIds: []
    };
    this._wizardMode = true;
    this.requestUpdate();
  }

  async _loadLesson(id, uid) {
      try {
          const q = query(collection(db, 'lessons'), where('id', '==', id), where('ownerId', '==', uid));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
              this.lesson = snapshot.docs[0].data();
              this._wizardMode = false;
          } else {
              this._loadError = true;
          }
      } catch (e) {
          console.error("Load error", e);
          this._loadError = true;
      }
  }

  // --- 4. UPLOAD HANDLING (RESTORED) ---
  async _handleFileUpload(e) {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      this._isLoading = true;
      try {
          for (const file of files) {
              // Simple upload to user folder
              const path = `courses/${this._currentUser.uid}/media/${Date.now()}_${file.name}`;
              const storageRef = ref(storage, path);
              await uploadBytes(storageRef, file);

              // Add to local list
              this._uploadedFiles = [...this._uploadedFiles, {
                  name: file.name,
                  storagePath: path,
                  mimeType: file.type
              }];
          }
          showToast(translationService.t('common.upload_success') || "Nahráno", false);
      } catch (err) {
          console.error(err);
          showToast(translationService.t('common.upload_error') || "Chyba nahrávání", true);
      } finally {
          this._isLoading = false;
          // Reset input
          e.target.value = '';
      }
  }

  _removeFile(index) {
      this._uploadedFiles.splice(index, 1);
      this._uploadedFiles = [...this._uploadedFiles];
      this.requestUpdate();
  }

  // --- 5. AUTOMAGIC LOGIC (SEQUENTIAL) ---
  async _handleAutoMagic() {
      if (!this.lesson.title) {
          showToast(translationService.t('editor.lessonTitlePlaceholder') || "Zadejte název", true);
          return;
      }

      const filePaths = this._uploadedFiles
          .map(f => this._normalizeToGsUrl(f))
          .filter(p => p !== null);

      console.log("🚀 Payload:", filePaths);

      this._isLoading = true;
      try {
          if (!this.lesson.id) {
             const newRef = doc(collection(db, 'lessons'));
             this.lesson.id = newRef.id;
             this.lesson.ownerId = this._currentUser.uid;
          }
          if (this._selectedClassId) this.lesson.classIds = [this._selectedClassId];
          await this._handleSave();

          const types = ['text', 'presentation', 'quiz', 'test', 'post', 'flashcards', 'mindmap', 'comic'];
          let generatedText = this.lesson.text_content || '';
          let successCount = 0;

          // Phase 1: Text
          if (types.includes('text')) {
              this._magicStatus = "Generuji Text..."; this.requestUpdate();
              try {
                  const res = await this._callAiGeneration('text', this.lesson.title, null, filePaths);
                  generatedText = res.text_content || res.text || (typeof res === 'string' ? res : JSON.stringify(res));
                  this.lesson.text_content = generatedText;
                  await this._handleSave();
                  successCount++;
              } catch (e) { console.error("Text failed", e); }
          }

          // Phase 2: Derivatives
          for (const type of types) {
              if (type === 'text') continue;
              this._magicStatus = `Generuji ${type}...`; this.requestUpdate();
              try {
                  const res = await this._callAiGeneration(type, this.lesson.title, generatedText, filePaths);
                  // Basic mapping (expand as needed)
                  if (type === 'quiz') this.lesson.quiz = { questions: res.questions || res };
                  if (type === 'test') this.lesson.test = { questions: res.questions || res };
                  if (type === 'post') this.lesson.post = res;
                  if (type === 'flashcards') this.lesson.flashcards = res.flashcards || res;
                  if (type === 'mindmap') this.lesson.mindmap = res;
                  if (type === 'presentation') {
                       this.lesson.presentation = { slides: res.slides || res, styleId: 'default' };
                       this._generateImagesForSlides(this.lesson.presentation.slides);
                  }
                  if (type === 'comic') {
                      this.lesson.comic = { panels: res.panels || res };
                      this._generateImagesForComic(this.lesson.comic.panels);
                  }
                  await this._handleSave();
                  successCount++;
              } catch (e) { console.warn(`Skipping ${type}`, e); }
          }

          showToast(translationService.t('lesson.magic_done') || "Hotovo!", false);
          this._wizardMode = false;
      } catch (e) {
          showToast("Chyba: " + e.message, true);
      } finally {
          this._isLoading = false;
          this._magicStatus = '';
      }
  }

  // ... (Keep existing image helpers & render methods) ...
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
      const storageRef = ref(storage, `courses/${this._currentUser.uid}/media/${filename}`);
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

  // --- 6. RENDER WITH HUB ---
  render() {
      if (this._loadError) return html`<div class="p-8 text-center text-red-500">Chyba načítání. <button @click="${() => location.reload()}">Zkusit znovu</button></div>`;
      if (this._wizardMode) return this._renderWizard();
      if (!this.lesson) return html`<div class="flex items-center justify-center h-screen"><div class="loading-spinner"></div></div>`;

      return html`
        <div class="h-screen flex flex-col bg-gray-50">
            <professor-header-editor .lesson="${this.lesson}" .isSaving="${this.isSaving}" @save="${this._handleSave}" @back="${() => window.location.href = '/professor/dashboard'}"></professor-header-editor>
            <div class="flex-1 flex overflow-hidden">
                <div class="w-64 bg-white border-r overflow-y-auto">${this._renderSidebar()}</div>
                <div class="flex-1 overflow-y-auto p-8">
                    ${this._isLoading ? html`<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"><div class="bg-white p-6 rounded text-center"><div class="loading-spinner mb-4"></div><p>${this._magicStatus || 'Pracuji...'}</p></div></div>` : ''}
                    ${this._renderActiveSection()}
                </div>
            </div>
        </div>`;
  }

  _renderWizard() {
      return html`
      <div class="fixed inset-0 bg-gray-100 z-50 flex items-center justify-center p-4">
          <div class="bg-white rounded-xl shadow-2xl max-w-4xl w-full p-8 overflow-y-auto max-h-screen">
              <h2 class="text-3xl font-bold mb-6 text-gray-800 text-center">
                  ${translationService.t('editor.titleNew') || "Nová lekce"}
              </h2>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div class="space-y-4">
                      <div>
                          <label class="block text-sm font-medium text-gray-700 mb-1">${translationService.t('editor.lessonTitle') || "Název lekce"}</label>
                          <input type="text" class="w-full p-3 border rounded-lg"
                              .value="${this.lesson?.title || ''}" @input="${(e) => this.lesson.title = e.target.value}"
                              placeholder="${translationService.t('editor.lessonTitlePlaceholder') || "Např. Úvod do..."}">
                      </div>
                      <div>
                          <label class="block text-sm font-medium text-gray-700 mb-1">${translationService.t('editor.subject') || "Předmět"}</label>
                          <input type="text" class="w-full p-3 border rounded-lg"
                              .value="${this.lesson?.target_audience || ''}" @input="${(e) => this.lesson.target_audience = e.target.value}">
                      </div>
                      <div>
                          <label class="block text-sm font-medium text-gray-700 mb-1">${translationService.t('editor.subtitle') || "Téma"}</label>
                          <input type="text" class="w-full p-3 border rounded-lg"
                              .value="${this.lesson?.topic || ''}" @input="${(e) => this.lesson.topic = e.target.value}">
                      </div>
                      <div>
                          <label class="block text-sm font-medium text-gray-700 mb-1">${translationService.t('editor.classAssignment') || "Přiřadit k třídě"}</label>
                          <select class="w-full p-3 border rounded-lg bg-white" @change="${(e) => this._selectedClassId = e.target.value}">
                              <option value="">-- Vyberte --</option>
                              ${this._availableClasses.map(cls => html`<option value="${cls.id}">${cls.name}</option>`)}
                          </select>
                      </div>
                  </div>

                  <div class="flex flex-col">
                      <label class="block text-sm font-medium text-gray-700 mb-2">${translationService.t('editor.filesAndRag') || "Zdrojové soubory"}</label>
                      <div class="flex-1 bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col gap-4">

                          <div class="flex gap-2">
                              <input type="file" multiple id="fileInput" class="hidden" @change="${this._handleFileUpload}">

                              <button @click="${() => this.shadowRoot.getElementById('fileInput').click()}"
                                  class="flex-1 py-2 bg-white border border-blue-200 text-blue-700 rounded hover:bg-blue-50 font-medium text-sm flex items-center justify-center gap-2">
                                  📂 Nahrát z disku
                              </button>

                              <button @click="${() => showToast('Funkce knihovny se připravuje', false)}"
                                  class="flex-1 py-2 bg-white border border-blue-200 text-blue-700 rounded hover:bg-blue-50 font-medium text-sm flex items-center justify-center gap-2">
                                  📚 Z knihovny
                              </button>
                          </div>

                          <div class="flex-1 overflow-y-auto max-h-48 bg-white rounded border border-gray-200 p-2">
                              ${this._uploadedFiles.length > 0 ? html`
                                  <ul class="space-y-2">
                                      ${this._uploadedFiles.map((f, index) => html`
                                          <li class="flex items-center justify-between text-sm text-gray-700 bg-gray-50 p-2 rounded">
                                              <span class="truncate flex-1" title="${f.name}">${f.name}</span>
                                              <button @click="${() => this._removeFile(index)}" class="text-red-500 hover:text-red-700 ml-2">✕</button>
                                          </li>
                                      `)}
                                  </ul>
                              ` : html`
                                  <div class="text-center text-gray-400 text-sm mt-4">Žádné soubory</div>
                              `}
                          </div>
                      </div>
                  </div>
              </div>

              <div class="flex gap-4 pt-4 border-t">
                  <button @click="${() => this._wizardMode = false}"
                      class="flex-1 px-6 py-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-bold">
                      ${translationService.t('professor.manual_create') || "Vytvořit manuálně"}
                  </button>
                  <button @click="${this._handleAutoMagic}"
                      class="flex-1 px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 font-bold shadow-xl">
                      ✨ ${translationService.t('lesson.magic_btn') || "Magica AI"}
                  </button>
              </div>
          </div>
      </div>`;
  }

  _renderSidebar() {
      const sections = [
          { id: 'text', label: translationService.t('editor.sidebar.text') || 'Text', icon: '📝' },
          { id: 'presentation', label: translationService.t('editor.sidebar.presentation') || 'Prezentace', icon: '📊' },
          { id: 'quiz', label: translationService.t('editor.sidebar.quiz') || 'Kvíz', icon: '❓' },
          { id: 'test', label: translationService.t('editor.sidebar.test') || 'Test', icon: '📝' },
          { id: 'flashcards', label: translationService.t('editor.sidebar.flashcards') || 'Kartičky', icon: '🃏' },
          { id: 'comic', label: translationService.t('editor.sidebar.comic') || 'Komiks', icon: '💬' },
          { id: 'mindmap', label: translationService.t('editor.sidebar.mindmap') || 'Myšlenková mapa', icon: '🧠' },
          { id: 'post', label: translationService.t('editor.sidebar.post') || 'Příspěvek', icon: '📰' }
      ];

      return html`
          <nav class="p-4 space-y-2">
              ${sections.map(section => html`
                  <button
                      @click="${() => this._activeSection = section.id}"
                      class="w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors
                      ${this._activeSection === section.id
                          ? 'bg-blue-100 text-blue-800'
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
          default: return html`<div class="text-center text-gray-500 mt-20">${translationService.t('editor.select_section') || 'Vyberte sekci'}</div>`;
      }
  }
}

customElements.define('lesson-editor', LessonEditor);