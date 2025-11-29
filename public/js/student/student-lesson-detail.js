// Súbor: public/js/student/student-lesson-detail.js

import { LitElement, html, nothing } from 'https://cdn.skypack.dev/lit';
import { doc, getDoc, onSnapshot, updateDoc, arrayUnion, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../firebase-init.js';
import { renderPresentation } from './presentation-handler.js';
import { translationService } from '../utils/translation-service.js';

// Musíme importovať všetky komponenty, ktoré tento komponent bude renderovať
import './quiz-component.js';
import './test-component.js';
import './podcast-component.js';
import './chat-panel.js';
import './flashcards-component.js';
import './mindmap-component.js';

// Presunutá funkcia z student.js
function normalizeLessonData(rawData) {
    const normalized = { ...rawData };
    normalized.youtube_link = rawData.youtube_link || rawData.videoUrl || null;
    normalized.presentation = rawData.presentation || rawData.presentationData || null;
    normalized.podcast_script = rawData.podcast_script || rawData.post || rawData.postData || null;
    normalized.text_content = rawData.text_content || rawData.content || null;
    normalized.quiz = rawData.quiz || rawData.quizData || null;
    normalized.test = rawData.test || rawData.testData || null;
    normalized.flashcards = rawData.flashcards || null;
    normalized.mindmap = rawData.mindmap || null;
    return normalized;
}

export class StudentLessonDetail extends LitElement {

    static get properties() {
        return {
            lessonId: { type: String },
            currentUserData: { type: Object },
            lessonData: { type: Object },
            availableTabs: { type: Array, state: true },
            activeTabId: { type: String, state: true },
            isLoading: { type: Boolean, state: true },
            _viewMode: { type: String, state: true }, // 'hub' or 'content'
            _progress: { type: Object, state: true }
        };
    }

    constructor() {
        super();
        this.lessonId = null;
        this.currentUserData = null;
        this.lessonData = null;
        this.availableTabs = [];
        this.activeTabId = null;
        this.isLoading = true;
        this._viewMode = 'hub';
        this._progress = { completedSections: [] };
        this._progressUnsubscribe = null;
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
        // Subscribe to language changes
        this._langUnsubscribe = translationService.subscribe(() => this.requestUpdate());
        this._initProgressTracking();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._langUnsubscribe) {
            this._langUnsubscribe();
        }
        if (this._progressUnsubscribe) {
            this._progressUnsubscribe();
        }
    }

    _initProgressTracking() {
        const user = firebaseInit.auth.currentUser;
        if (!user || !this.lessonId) return;

        const progressRef = doc(firebaseInit.db, `students/${user.uid}/progress/${this.lessonId}`);

        this._progressUnsubscribe = onSnapshot(progressRef, (docSnap) => {
            if (docSnap.exists()) {
                this._progress = docSnap.data();
            } else {
                this._progress = { completedSections: [] };
            }
        }, (error) => {
            console.error("Error tracking progress:", error);
        });
    }

    async _markSectionComplete(sectionId) {
        if (!sectionId) return;
        const user = firebaseInit.auth.currentUser;
        if (!user || !this.lessonId) return;

        // Optimistic update
        if (!this._progress.completedSections) this._progress.completedSections = [];
        if (!this._progress.completedSections.includes(sectionId)) {
            // Optimistic
            this._progress = {
                ...this._progress,
                completedSections: [...this._progress.completedSections, sectionId]
            };

            const progressRef = doc(firebaseInit.db, `students/${user.uid}/progress/${this.lessonId}`);
            try {
                // Use setDoc with merge: true to handle both create and update
                await setDoc(progressRef, {
                    completedSections: arrayUnion(sectionId),
                    lastUpdated: new Date()
                }, { merge: true });

            } catch (e) {
                console.error("Error saving progress:", e);
            }
        }
    }

    willUpdate(changedProperties) {
        // If lessonData is passed as a property, use it directly for live preview.
        if (changedProperties.has('lessonData') && this.lessonData) {
            this.lessonData = normalizeLessonData(this.lessonData);
            this._buildAvailableTabs();
            this.isLoading = false;
            this._viewMode = 'hub';
        }
        // Otherwise, if lessonId is passed, fetch from Firestore as usual.
        else if (changedProperties.has('lessonId') && this.lessonId && !this.lessonData) {
            this._fetchLessonDetail();
            this._initProgressTracking(); // Re-init tracking if lessonId changes
        }
    }

    async _fetchLessonDetail() {
        this.isLoading = true;
        this.lessonData = null;
        this._viewMode = 'hub'; // Reset to hub on new lesson
        try {
            const docRef = doc(firebaseInit.db, "lessons", this.lessonId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                this.lessonData = normalizeLessonData(docSnap.data());
                this._buildAvailableTabs();
            } else {
                console.error("Lekce nenalezena!");
            }
        } catch (error) {
            console.error("Error fetching lesson detail:", error);
        } finally {
            this.isLoading = false;
        }
    }

    _getContentStats(type) {
        if (!this.lessonData) return '';

        switch (type) {
            case 'presentation':
                return (Array.isArray(this.lessonData.presentation) ? this.lessonData.presentation.length : 0) + ' slidů';
            case 'quiz':
                return (this.lessonData.quiz && this.lessonData.quiz.questions ? this.lessonData.quiz.questions.length : 0) + ' otázek';
            case 'test':
                return (this.lessonData.test && this.lessonData.test.questions ? this.lessonData.test.questions.length : 0) + ' otázek';
            case 'flashcards':
                return (Array.isArray(this.lessonData.flashcards) ? this.lessonData.flashcards.length : 0) + ' kartiček';
            case 'podcast':
                return '1 epizoda';
            case 'video':
                return '1 video';
            case 'mindmap':
                return '1 mapa';
            default:
                return '';
        }
    }

    _buildAvailableTabs() {
        // Build tab list with metadata for the Hub
        const tabs = [];

        // Helper to add tabs
        const addTab = (id, name, icon, description, colorClass) => {
             // Check visibility logic:
             // If visible_sections is undefined => All visible by default (legacy)
             // If defined => Only if included
             // NOTE: 'ai-assistant' and 'professor-chat' are always visible for now, or could have their own logic.
             // For content types (text, video, etc.), we check the visibility.

             let isVisible = true;

             // Mapping tab ID to content ID used in editor visibility
             // text -> text
             // video -> video
             // presentation -> presentation
             // podcast -> post (special mapping)
             // quiz -> quiz
             // test -> test
             // flashcards -> flashcards
             // mindmap -> mindmap

             const editorIdMap = {
                 'text': 'text',
                 'video': 'video',
                 'presentation': 'presentation',
                 'podcast': 'post',
                 'quiz': 'quiz',
                 'test': 'test',
                 'flashcards': 'flashcards',
                 'mindmap': 'mindmap'
             };

             const editorId = editorIdMap[id];

             // If it's a content tab, check visibility
             if (editorId && this.lessonData.visible_sections) {
                 isVisible = this.lessonData.visible_sections.includes(editorId);
             }

             if (isVisible) {
                 tabs.push({ id, name, icon, description, colorClass });
             }
        };

        if (this.lessonData.text_content)
            addTab('text', translationService.t('content_types.text'), '📝', translationService.t('content_types.text_desc'), 'bg-blue-50 text-blue-600');

        if (this.lessonData.youtube_link)
            addTab('video', translationService.t('content_types.video'), '🎬', translationService.t('content_types.video_desc'), 'bg-red-50 text-red-600');

        if (this.lessonData.presentation)
            addTab('presentation', translationService.t('content_types.presentation'), '📊', translationService.t('content_types.presentation_desc'), 'bg-orange-50 text-orange-600');

        if (this.lessonData.podcast_script)
            addTab('podcast', translationService.t('content_types.audio'), '🎙️', translationService.t('content_types.audio_desc'), 'bg-purple-50 text-purple-600');

        if (this.lessonData.quiz)
            addTab('quiz', translationService.t('content_types.quiz'), '❓', translationService.t('content_types.quiz_desc'), 'bg-green-50 text-green-600');

        if (this.lessonData.test)
            addTab('test', translationService.t('content_types.test'), '📝', translationService.t('content_types.test_desc'), 'bg-emerald-50 text-emerald-600');

        if (this.lessonData.flashcards)
            addTab('flashcards', translationService.t('content_types.flashcards'), '🗂️', translationService.t('content_types.flashcards_desc'), 'bg-yellow-50 text-yellow-600');

        if (this.lessonData.mindmap)
            addTab('mindmap', translationService.t('content_types.mindmap'), '🧠', translationService.t('content_types.mindmap_desc'), 'bg-pink-50 text-pink-600');

        // Always available tools (for now, unless we want to hide them too)
        addTab('ai-assistant', 'AI Asistent', '🤖', 'Zeptejte se umělé inteligence', 'bg-indigo-50 text-indigo-600');
        addTab('professor-chat', 'Konzultace', '💬', 'Napište profesorovi', 'bg-slate-50 text-slate-600');
        
        this.availableTabs = tabs;
    }

    _handleBackToList() {
        const event = new CustomEvent('back-to-list', { bubbles: true, composed: true });
        this.dispatchEvent(event);
    }

    _handleHubItemClick(tabId) {
        this.activeTabId = tabId;
        this._viewMode = 'content';
        window.scrollTo(0, 0);
    }

    _handleBackToHub() {
        // Stop podcast if playing
        if (window.speechSynthesis && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        this._viewMode = 'hub';
        this.activeTabId = null;
    }

    render() {
        if (this.isLoading) {
            return html`
                <div class="flex justify-center items-center h-full pt-20">
                     <div class="spinner w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>`;
        }

        if (!this.lessonData) {
            return html`<div class="p-8 text-center text-red-500">Nepodařilo se načíst lekci.</div>`;
        }

        if (this._viewMode === 'hub') {
            return this._renderHub();
        } else {
            return this._renderContentMode();
        }
    }

    _renderHub() {
        // Calculate progress
        const totalContentTabs = this.availableTabs.filter(t => !['ai-assistant', 'professor-chat'].includes(t.id)).length;
        const completedCount = this._progress?.completedSections?.length || 0;
        // Ensure we don't show more than total (in case of legacy data or mismatches)
        const displayCompleted = Math.min(completedCount, totalContentTabs);
        const progressPercent = totalContentTabs > 0 ? Math.round((displayCompleted / totalContentTabs) * 100) : 0;

        return html`
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <!-- Header -->
                <div class="mb-8">
                    <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div>
                            <button @click=${this._handleBackToList} class="mb-4 text-slate-500 hover:text-indigo-600 flex items-center transition-colors">
                                <span class="mr-2">←</span> ${translationService.t('common.back')}
                            </button>
                            <h1 class="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight mb-2">${this.lessonData.title}</h1>
                            ${this.lessonData.subtitle ? html`<p class="text-lg text-slate-500 max-w-3xl">${this.lessonData.subtitle}</p>` : ''}
                        </div>

                        <!-- Progress Widget -->
                        ${totalContentTabs > 0 ? html`
                            <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 min-w-[200px]">
                                <div class="flex justify-between items-center mb-2">
                                    <span class="text-sm font-bold text-slate-700">${translationService.t('student.progress_label')}</span>
                                    <span class="text-xs font-mono text-slate-500">${displayCompleted} / ${totalContentTabs}</span>
                                </div>
                                <div class="w-full bg-slate-100 rounded-full h-2.5">
                                    <div class="bg-gradient-to-r from-indigo-500 to-purple-500 h-2.5 rounded-full transition-all duration-1000" style="width: ${progressPercent}%"></div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${this.availableTabs.map(tab => {
                        const isCompleted = this._progress?.completedSections?.includes(tab.id);
                        return html`
                            <div @click=${() => this._handleHubItemClick(tab.id)}
                                 class="relative bg-white rounded-xl border ${isCompleted ? 'border-green-200 ring-1 ring-green-100' : 'border-slate-200'} shadow-sm p-6 flex flex-col items-center text-center hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer h-full group overflow-hidden">

                                ${isCompleted ? html`
                                    <div class="absolute top-0 right-0 p-3">
                                        <div class="bg-green-100 text-green-600 rounded-full p-1 shadow-sm">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                                        </div>
                                    </div>
                                ` : ''}

                                <div class="w-12 h-12 rounded-lg ${tab.colorClass} flex items-center justify-center mb-4 text-2xl group-hover:scale-110 transition-transform">
                                    ${tab.icon}
                                </div>

                                <h3 class="font-bold text-slate-900 mb-1 text-lg group-hover:text-indigo-600 transition-colors">${tab.name}</h3>
                                <p class="text-sm text-slate-500 mb-4 leading-relaxed">${tab.description}</p>

                                <div class="mt-auto pt-2">
                                    <span class="text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wide transition-colors ${isCompleted ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600'}">
                                        ${isCompleted ? 'Hotovo' : '✨ Začít'}
                                    </span>
                                </div>
                            </div>
                        `;
                    })}
                </div>
            </div>
        `;
    }

    _renderContentMode() {
        const activeTab = this.availableTabs.find(t => t.id === this.activeTabId);

        return html`
            <div class="flex flex-col min-h-screen bg-slate-50">
                <!-- Sticky Header -->
                <div class="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
                    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                        <button @click=${this._handleBackToHub} class="flex items-center text-slate-600 hover:text-indigo-600 font-medium transition-colors">
                            <span class="mr-2 text-xl">←</span>
                            <span class="hidden sm:inline">Zpět na přehled lekce</span>
                            <span class="sm:hidden">Zpět</span>
                        </button>

                        <div class="font-bold text-slate-800 text-lg truncate px-4">
                            ${activeTab ? activeTab.name : ''}
                        </div>

                        <div class="w-8"></div> <!-- Spacer for centering -->
                    </div>
                </div>

                <!-- Content Area -->
                <div class="flex-grow max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
                    <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 md:p-8 min-h-[500px]">
                        ${this._renderTabContent()}
                    </div>
                </div>
            </div>
        `;
    }

    _renderTabContent() {
        // `renderPresentation` je špeciálny prípad, lebo manipuluje s DOM, musíme mu dať kontajner
        if (this.activeTabId === 'presentation') {
            // Počkáme, kým sa tento div vyrenderuje, a potom doň vložíme prezentáciu
            setTimeout(() => {
                const contentArea = this.querySelector('#presentation-container');
                if (contentArea) {
                    renderPresentation(contentArea, this.lessonData.presentation);
                }
            }, 0);
            return html`
                <div id="presentation-container"></div>
                <div class="mt-8 flex justify-center">
                    <button @click=${() => this._markSectionComplete('presentation')} class="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition-colors">
                        Prezentace prostudována ✅
                    </button>
                </div>
            `;
        }
        
        // Ostatné prípady
        switch (this.activeTabId) {
            case 'text':
                // ==== ZMENA: Použijeme marked.parse() na prevod Markdown na HTML ====
                if (typeof marked === 'undefined') {
                    console.error("Knižnica marked.js nie je načítaná!");
                    return html`<p class="text-red-500">Chyba: Nepodarilo sa spracovať formátovanie textu.</p>`;
                }
                const textContentDiv = document.createElement('div');
                textContentDiv.className = "prose prose-indigo max-w-none prose-lg"; // Added prose-indigo and prose-lg
                textContentDiv.innerHTML = marked.parse(this.lessonData.text_content || ''); 
                return html`
                    ${textContentDiv}
                    <div class="mt-12 flex justify-center">
                        <button @click=${() => this._markSectionComplete('text')} class="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition-colors">
                            Dokončit čtení ✅
                        </button>
                    </div>
                `;
                
            case 'video':
                const videoIdMatch = this.lessonData.youtube_link ? this.lessonData.youtube_link.match(/(?:v=|\/embed\/|\.be\/)([\w-]{11})/) : null;
                if (videoIdMatch && videoIdMatch[1]) {
                    return html`
                        <div class="aspect-video w-full rounded-2xl overflow-hidden shadow-lg mb-8">
                            <iframe class="w-full h-full" src="https://www.youtube.com/embed/${videoIdMatch[1]}" frameborder="0" allowfullscreen></iframe>
                        </div>
                        <div class="flex justify-center">
                            <button @click=${() => this._markSectionComplete('video')} class="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition-colors">
                                Video shlédnuto ✅
                            </button>
                        </div>
                    `;
                } else {
                    return html`<p class="text-red-500">Neplatný nebo chybějící YouTube odkaz.</p>`;
                }
            case 'quiz':
                return html`<student-quiz .quizData=${this.lessonData.quiz} .lessonId=${this.lessonId} @quiz-completed=${() => this._markSectionComplete('quiz')}></student-quiz>`;
            case 'test':
                return html`<student-test .testData=${this.lessonData.test} .lessonId=${this.lessonId} @test-completed=${() => this._markSectionComplete('test')}></student-test>`;
            case 'podcast':
                return html`<student-podcast .podcastData=${this.lessonData.podcast_script} @podcast-completed=${() => this._markSectionComplete('podcast')}></student-podcast>`;
            case 'flashcards':
                return html`<flashcards-component .cards=${this.lessonData.flashcards} @flashcards-completed=${() => this._markSectionComplete('flashcards')}></flashcards-component>`;
            case 'mindmap':
                return html`
                    <mindmap-component .code=${this.lessonData.mindmap}></mindmap-component>
                    <div class="mt-8 flex justify-center">
                        <button @click=${() => this._markSectionComplete('mindmap')} class="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold shadow-lg hover:bg-indigo-700 transition-colors">
                            Prostudováno ✅
                        </button>
                    </div>
                `;
            case 'ai-assistant':
                return html`<chat-panel type="ai" .lessonId=${this.lessonId} .currentUserData=${this.currentUserData}></chat-panel>`;
            case 'professor-chat':
                return html`<chat-panel type="professor" .lessonId=${this.lessonId} .currentUserData=${this.currentUserData}></chat-panel>`;
            default:
                return html`<p>Obsah nelze načíst.</p>`;
        }
    }
}

customElements.define('student-lesson-detail', StudentLessonDetail);
