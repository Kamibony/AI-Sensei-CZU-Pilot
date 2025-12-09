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
import { processFileForRAG, uploadMultipleFiles, uploadSingleFile } from '../../utils/upload-handler.js';

export class LessonEditor extends BaseView {
  static properties = {
    lesson: { type: Object },
    isSaving: { type: Boolean },
    _selectedClassIds: { state: true, type: Array },
    _availableClasses: { state: true, type: Array },
    _showDeleteConfirm: { state: true, type: Boolean },
    _uploading: { state: true },
    _processingRAG: { state: true },
    _uploadedFiles: { state: true, type: Array } // Pole objektov { id, name, url, ... }
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
        this._uploadedFiles = this.lesson.files || []; // Načítame existujúce súbory
      } else {
        // Reset pre novú lekciu
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

      // Ak nemáme lekciu (nová), inicializujeme základnú štruktúru
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
          contentType: 'text', // Predvolený typ
          content: { blocks: [] }, // Prázdny obsah pre textový editor
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
      showToast(translationService.t('lesson.toast_title_required'), true);
      return;
    }

    this.isSaving = true;
    try {
      const user = auth.currentUser;
      if (!user) throw new Error(translationService.t('media.login_required'));

      const lessonData = {
        ...this.lesson,
        assignedToGroups: this._selectedClassIds,
        files: this._uploadedFiles, // Uložíme zoznam súborov
        updatedAt: new Date().toISOString(),
        ownerId: user.uid
      };

      if (!lessonData.id) {
          // Vytvorenie novej lekcie
          lessonData.createdAt = new Date().toISOString();
          // Generate ID manually to avoid empty doc
          const newDocRef = doc(collection(db, 'lessons'));
          lessonData.id = newDocRef.id;
          await setDoc(newDocRef, lessonData);
          this.lesson = lessonData; // Update local state with ID
          showToast(translationService.t('common.saved'));

          // Emit event to notify parent (app) about creation
          this.dispatchEvent(new CustomEvent('lesson-updated', {
              detail: this.lesson,
              bubbles: true,
              composed: true
          }));

      } else {
          // Aktualizácia existujúcej
          const lessonRef = doc(db, 'lessons', this.lesson.id);
          await updateDoc(lessonRef, lessonData);
          showToast(translationService.t('common.saved'));
           // Emit event
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
      // Smart Back logic
      const urlParams = new URLSearchParams(window.location.search);
      const source = urlParams.get('source');

      // Default to dashboard if no specific source, but professor-app handles 'dashboard' as default
      let targetView = 'dashboard';

      if (this.lesson && this.lesson.id) {
         // Ak sme editovali existujúcu lekciu, vrátime sa tam, odkiaľ sme prišli (ak vieme), inak timeline/hub
         // Ale podľa zadania: "if in editor mode -> go to Hub; if in Hub -> go to Timeline"
         // Táto komponenta je 'editor', takže 'Hub' je myslený asi ako Dashboard?
         // Alebo 'Lesson Library' (timeline).
         // V 'ProfessorApp' je 'lesson-library' (sidebar) a 'timeline-view'.

         // Zjednodušenie: Vždy sa vrátime na Timeline (Knihovna lekcí), čo je bezpečná voľba pre prehľad.
         targetView = 'timeline';
      } else {
         // Ak sme vytvárali novú a zrušili to
         targetView = 'timeline';
      }

      this.dispatchEvent(new CustomEvent('editor-exit', {
          detail: { view: targetView },
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
  }

  async _handleFilesSelected(e) {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      this._uploading = true;
      try {
          const user = auth.currentUser;
          if (!user) throw new Error(translationService.t('media.login_required'));

          // 1. Upload súborov do Storage a vytvorenie záznamov v Firestore (cez utils)
          // Pre lekciu použijeme špecifickú cestu alebo metadata, aby sme ich vedeli priradiť.
          // Tu využijeme existujúci 'uploadMultipleFiles' ktorý dáva súbory do 'course-media'.
          // Pre RAG potrebujeme, aby boli spracované.

          // uploadMultipleFiles vracia { successful, failed }
          // successful obsahuje { fileId, fileName, url, ... }

          // ID kurzu: Tu je to trochu zložitejšie, lebo lekcia môže byť vo viacerých kurzoch.
          // Ale súbory nahrávame pod profesora (user.uid).
          // Použijeme "main-course" ako placeholder ak nemáme špecifický kurz, alebo ID prvej vybranej triedy.
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

          // Pridáme k existujúcim
          this._uploadedFiles = [...this._uploadedFiles, ...newFiles];

          // 2. Automatické spracovanie pre RAG (voliteľné, ale pre 'Magic' potrebné)
          this._processingRAG = true;
          for (const file of newFiles) {
              if (file.name.toLowerCase().endsWith('.pdf')) { // Iba PDF zatiaľ
                  try {
                       await processFileForRAG(file.id);
                       showToast(`${translationService.t('common.success')}: ${file.name}`);
                  } catch (err) {
                      console.error("RAG processing failed for", file.name, err);
                      // Necháme súbor nahraný, len RAG zlyhal.
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
          // Vyčistiť input
          e.target.value = '';
          this._handleSave(); // Priebežné uloženie
      }
  }

  async _handleDeleteFile(fileIndex) {
      // Zatiaľ len odstránime zo zoznamu v lekcii.
      // Fyzické zmazanie zo Storage/Firestore by malo byť samostatné alebo na potvrdenie.
      // Pre jednoduchosť teraz len odpojíme od lekcie.
      this._uploadedFiles.splice(fileIndex, 1);
      this._uploadedFiles = [...this._uploadedFiles];
      this._handleSave();
  }

  // Handle Magic Generation event from ai-generator-panel
  _handleMagicGeneration(e) {
      const { prompt, type } = e.detail;
      // Preposielame event do editor-view-ai alebo priamo spracujeme.
      // Ale 'LessonEditor' je kontajner.
      // Máme tu 'ai-generator-panel' ktorý emituje 'generate'.
      // A máme 'editor-view-*' ktoré to konzumujú?
      // Nie, 'ai-generator-panel' volá backend a vracia dáta?
      // Pozrime sa na 'ai-generator-panel.js'.
      // Podľa kontextu (pamäť) 'ai-generator-panel' robí veľa vecí.

      // ZADANIE: "Ensure the _handleMagicGeneration logic sends episode_count: 3 for podcasts"
      // Takže tu musíme zachytiť požiadavku a zavolať backend.

      const filePaths = this._uploadedFiles.map(f => f.storagePath).filter(Boolean);

      // Určenie parametrov podľa typu obsahu lekcie (nie len typu požiadavky)
      // Ale 'type' v evente určuje čo generujeme.

      const generationParams = {
          prompt: prompt,
          contentType: this.lesson.contentType, // Typ obsahu lekcie (quiz, text, audio...)
          filePaths: filePaths
      };

      if (this.lesson.contentType === 'audio') {
          generationParams.episode_count = 3; // HARDCODED REQUIREMENT
      }

      // Nájdeme child komponent editora (napr. editor-view-text) a povieme mu "generuj"
      // Alebo zavoláme funkciu tu a výsledok pošleme do child.
      // Bežný pattern tu: child komponent má metódu 'generateContent(params)'

      const activeEditor = this.shadowRoot.querySelector('#active-editor');
      if (activeEditor && activeEditor.handleAiGeneration) {
          activeEditor.handleAiGeneration(generationParams);
      } else {
          console.warn("No active editor to handle generation");
      }
  }

  _renderHeader() {
    return html`
      <div class="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex justify-between items-center h-16">
            <div class="flex items-center gap-4">
              <button @click="${this._handleBackClick}"
                      class="p-2 -ml-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      title="${translationService.t('professor.editor.back')}">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                </svg>
              </button>

              <div class="flex flex-col">
                  <h1 class="text-lg font-bold text-slate-900 leading-none">
                      ${this.lesson.id ? translationService.t('professor.editor.titleEdit') : translationService.t('professor.editor.titleNew')}
                  </h1>
                  <span class="text-xs text-slate-500 mt-1">
                      ${this.isSaving ? translationService.t('common.loading') : (this.lesson.id ? translationService.t('common.saved') : translationService.t('lesson.status_draft'))}
                  </span>
              </div>
            </div>

            <div class="flex items-center gap-3">
               <button @click="${this._handleSave}"
                      class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors ${this.isSaving ? 'opacity-75 cursor-wait' : ''}"
                      ?disabled="${this.isSaving}">
                ${this.isSaving ? html`
                  <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  ${translationService.t('common.save')}
                ` : html`
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path>
                  </svg>
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
      switch (this.lesson.contentType) {
          case 'text': return html`<editor-view-text id="active-editor" .lesson=${this.lesson} @update=${e => { this.lesson = { ...this.lesson, content: e.detail }; }}></editor-view-text>`;
          case 'presentation': return html`<editor-view-presentation id="active-editor" .lesson=${this.lesson} @update=${e => { this.lesson = { ...this.lesson, slides: e.detail }; }}></editor-view-presentation>`;
          case 'quiz': return html`<editor-view-quiz id="active-editor" .lesson=${this.lesson} @update=${e => { this.lesson = { ...this.lesson, questions: e.detail }; }}></editor-view-quiz>`;
          case 'test': return html`<editor-view-test id="active-editor" .lesson=${this.lesson} @update=${e => { this.lesson = { ...this.lesson, questions: e.detail }; }}></editor-view-test>`;
          case 'post': return html`<editor-view-post id="active-editor" .lesson=${this.lesson} @update=${e => { this.lesson = { ...this.lesson, ...e.detail }; }}></editor-view-post>`;
          case 'audio': return html`<div class="p-4 text-center text-slate-500">Audio editor (Podcast) - Konfigurácia cez AI Panel</div>`;
          default: return html`<div class="p-4 text-center text-red-500">${translationService.t('common.unknown_type')}</div>`;
      }
  }

  render() {
    return html`
      <div class="h-full flex flex-col bg-slate-50 relative">
        ${this._renderHeader()}

        <div class="flex-1 overflow-hidden relative">
          <div class="absolute inset-0 overflow-y-auto custom-scrollbar">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

              <!-- Hero / Základní údaje -->
              <div class="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6">
                <div class="flex items-center gap-2 mb-4">
                    <div class="p-2 bg-indigo-50 rounded-lg">
                        <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                    </div>
                    <h2 class="text-lg font-semibold text-slate-800">${translationService.t('professor.editor.basicInfo')}</h2>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">${translationService.t('professor.editor.lessonTitle')}</label>
                            <input type="text"
                                   .value="${this.lesson.title}"
                                   @input="${e => this.lesson = { ...this.lesson, title: e.target.value }}"
                                   class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                   placeholder="${translationService.t('professor.editor.lessonTitlePlaceholder')}">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">${translationService.t('professor.editor.subtitle')}</label>
                            <textarea
                                   .value="${this.lesson.topic}"
                                   @input="${e => this.lesson = { ...this.lesson, topic: e.target.value }}"
                                   rows="2"
                                   class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
                                   placeholder="${translationService.t('professor.editor.subtitlePlaceholder')}"></textarea>
                        </div>
                    </div>

                    <div class="space-y-4">
                         <!-- Výber typu obsahu -->
                         <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">${translationService.t('lesson.subtitle')}</label> <!-- Používame label pre typ -->
                            <select .value="${this.lesson.contentType}"
                                    @change="${e => this.lesson = { ...this.lesson, contentType: e.target.value }}"
                                    class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
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
                </div>
              </div>

              <!-- 2-Column Grid: Classes & Files -->
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

                 <!-- Left: Classes -->
                 <div class="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 flex flex-col h-full">
                    <div class="flex items-center gap-2 mb-4">
                        <div class="p-2 bg-blue-50 rounded-lg">
                            <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                            </svg>
                        </div>
                        <h3 class="text-lg font-semibold text-slate-800">${translationService.t('professor.editor.classAssignment')}</h3>
                    </div>

                    ${this._availableClasses.length === 0 ? html`
                        <div class="flex-1 flex flex-col items-center justify-center text-center p-4 text-slate-500">
                            <p>${translationService.t('professor.no_classes_yet')}</p>
                        </div>
                    ` : html`
                        <div class="flex-1 overflow-y-auto max-h-60 space-y-2 custom-scrollbar pr-2">
                            ${this._availableClasses.map(group => html`
                                <label class="flex items-center p-3 rounded-xl border ${this._selectedClassIds.includes(group.id) ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'} cursor-pointer transition-colors">
                                    <input type="checkbox"
                                           .checked="${this._selectedClassIds.includes(group.id)}"
                                           @change="${() => this._handleClassToggle(group.id)}"
                                           class="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
                                    <span class="ml-3 font-medium text-slate-700">${group.name}</span>
                                </label>
                            `)}
                        </div>
                    `}
                 </div>

                 <!-- Right: Files/RAG -->
                 <div class="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 flex flex-col h-full">
                    <div class="flex items-center gap-2 mb-4 justify-between">
                        <div class="flex items-center gap-2">
                            <div class="p-2 bg-amber-50 rounded-lg">
                                <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                                </svg>
                            </div>
                            <div>
                                <h3 class="text-lg font-semibold text-slate-800">${translationService.t('professor.editor.filesAndRag')}</h3>
                            </div>
                        </div>
                         <div class="relative group">
                            <input type="file" multiple accept=".pdf,.docx,.txt"
                                   class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                   @change="${this._handleFilesSelected}"
                                   ?disabled="${this._uploading}">
                            <button class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                                </svg>
                                ${this._uploading ? translationService.t('lesson.upload_uploading') : translationService.t('common.files_select')}
                            </button>
                        </div>
                    </div>

                    <p class="text-sm text-slate-500 mb-4">${translationService.t('professor.editor.filesHelper')}</p>

                    <div class="flex-1 overflow-y-auto max-h-60 space-y-2 custom-scrollbar pr-2">
                        ${this._uploadedFiles.length === 0 ? html`
                            <div class="text-center p-4 border-2 border-dashed border-slate-200 rounded-xl">
                                <p class="text-sm text-slate-400">${translationService.t('common.no_files_selected')}</p>
                            </div>
                        ` : this._uploadedFiles.map((file, index) => html`
                            <div class="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 group">
                                <div class="flex items-center gap-3 overflow-hidden">
                                    <svg class="w-8 h-8 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 2H7a2 2 0 00-2 2v15a2 2 0 002 2z"></path>
                                    </svg>
                                    <div class="truncate">
                                        <p class="text-sm font-medium text-slate-700 truncate" title="${file.name}">${file.name}</p>
                                        <p class="text-xs text-slate-400">PDF • RAG Ready</p>
                                    </div>
                                </div>
                                <button @click="${() => this._handleDeleteFile(index)}" class="p-1 text-slate-400 hover:text-red-500 rounded transition-colors">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                    </svg>
                                </button>
                            </div>
                        `)}
                    </div>
                 </div>

              </div>

              <!-- AI Generator Panel (Reusable Component) -->
              <div class="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6">
                 <ai-generator-panel @generate="${this._handleMagicGeneration}"></ai-generator-panel>
              </div>

              <!-- Main Editor Area -->
              <div class="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden min-h-[500px] flex flex-col">
                  ${this._renderEditorContent()}
              </div>

            </div>
          </div>
        </div>
      </div>
    `;
  }
}
customElements.define('lesson-editor', LessonEditor);
