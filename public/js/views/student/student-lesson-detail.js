import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { doc, getDoc, onSnapshot, updateDoc, arrayUnion, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import confetti from 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/+esm';
import * as firebaseInit from '../../firebase-init.js';
import { showToast } from '../../utils/utils.js';
import { renderPresentation } from './presentation-handler.js';
import { translationService } from '../../utils/translation-service.js';

import './quiz-component.js';
import './test-component.js';
import './podcast-component.js';
import './chat-panel.js';
import './flashcards-component.js';
import './mindmap-component.js';
import './comic-component.js'; // Import Comic Component
import '../../components/magic-board-view.js';

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
    normalized.comic = rawData.comic || null; // Add Comic
    normalized.files = rawData.files || [];
    return normalized;
}

export class StudentLessonDetail extends LitElement {

    static get properties() {
        return {
            lessonId: { type: String },
            currentUserData: { type: Object },
            lessonData: { type: Object },
            activeTabId: { type: String, state: true },
            isLoading: { type: Boolean, state: true },
            _progress: { type: Object, state: true }
        };
    }

    constructor() {
        super();
        this.lessonId = null;
        this.currentUserData = null;
        this.lessonData = null;
        this.activeTabId = null;
        this.isLoading = true;
        this._progress = { completedSections: [] };
        this._progressUnsubscribe = null;
        this._langUnsubscribe = null;
    }

    createRenderRoot() {
        return this;
    }

    connectedCallback() {
        super.connectedCallback();
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
        if (!user) {
            console.error("Critical Error: User not authenticated in _markSectionComplete");
            showToast("Chyba: Uživatel není přihlášen.", true);
            return;
        }

        if (!this.lessonId) {
             console.error("Critical Error: Missing lessonId in _markSectionComplete");
             return;
        }

        const currentCompleted = this._progress.completedSections || [];
        if (currentCompleted.includes(sectionId)) return;

        const newCompleted = [...currentCompleted, sectionId];

        this._progress = {
            ...this._progress,
            completedSections: newCompleted
        };
        this.requestUpdate();

        const path = `students/${user.uid}/progress/${this.lessonId}`;
        const progressRef = doc(firebaseInit.db, path);

        try {
            await setDoc(progressRef, {
                completedSections: arrayUnion(sectionId),
                lastUpdated: new Date()
            }, { merge: true });

            console.log(`Progress saved successfully to ${path}`);
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });

        } catch (e) {
            console.error(`Error saving progress to ${path}:`, e);
            this._progress = {
                ...this._progress,
                completedSections: currentCompleted
            };
            this.requestUpdate();
            showToast("Chyba při ukládání postupu. Zkuste to prosím znovu.", true);
        }
    }

    willUpdate(changedProperties) {
        if (changedProperties.has('lessonData') && this.lessonData) {
            this.lessonData = normalizeLessonData(this.lessonData);
            this.isLoading = false;
            if (!this.activeTabId) {
                this.activeTabId = this._getDefaultTab();
            }
        }
        else if (changedProperties.has('lessonId') && this.lessonId && !this.lessonData) {
            this._fetchLessonDetail();
            this._initProgressTracking();
        }
    }

    async updated(changedProperties) {
        super.updated(changedProperties);

        // ARCHITECTURAL CHANGE: Force UI Language based on Lesson settings
        if (this.lessonData && this.lessonData.language) {
            const currentLang = translationService.currentLanguage;
            if (this.lessonData.language !== currentLang) {
                 console.log(`[Localization] Enforcing lesson language: ${this.lessonData.language}`);
                 translationService.setLanguage(this.lessonData.language);
            }
        }

        if (this.activeTabId === 'presentation') {
            await this.updateComplete;
            const container = this.renderRoot.querySelector('#presentation-container');
            if (container && this.lessonData?.presentation) {
                container.innerHTML = '';
                renderPresentation(container, this.lessonData.presentation);
            }
        }
    }

    async _fetchLessonDetail() {
        console.log("Fetching lesson detail for ID:", this.lessonId);
        this.isLoading = true;
        this.lessonData = null;
        try {
            const docRef = doc(firebaseInit.db, "lessons", this.lessonId);
            console.log("Calling getDoc...");
            const docSnap = await getDoc(docRef);
            console.log("getDoc returned. Exists:", docSnap.exists());

            if (docSnap.exists()) {
                console.log("Lesson data:", docSnap.data());
                this.lessonData = normalizeLessonData(docSnap.data());
                if (!this.activeTabId) {
                    this.activeTabId = this._getDefaultTab();
                }
            } else {
                console.error("Lekce nenalezena!");
            }
        } catch (error) {
            console.error("Error fetching lesson detail:", error);
            // Verify permissions error
            if (error.code === 'permission-denied') {
                 console.error("PERMISSION DENIED. Check Security Rules.");
            }
        } finally {
            console.log("Fetch finished. isLoading = false");
            this.isLoading = false;
        }
    }

    _getDefaultTab() {
        if (!this.lessonData) return null;
        if (this.lessonData.text_content) return 'study';
        if (this.lessonData.podcast_script) return 'podcast';
        if (this.lessonData.presentation) return 'presentation';
        if (this.lessonData.quiz) return 'quiz';
        if (this.lessonData.test) return 'test';
        if (this.lessonData.comic) return 'comic'; // Add default comic tab
        return 'study';
    }

    _handleBackToList() {
        const event = new CustomEvent('back-to-list', { bubbles: true, composed: true });
        this.dispatchEvent(event);
    }

    _switchTab(tabId) {
        this.activeTabId = tabId;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    _getTabs() {
        if (!this.lessonData) return [];
        const tabs = [];
        const ld = this.lessonData;

        // 1. Study Room (Combines Text + Files + Video)
        if (ld.text_content || ld.youtube_link) {
            tabs.push({ id: 'study', label: translationService.t('student.tabs.study'), icon: '📚', desc: translationService.t('student.tabs.desc_study') });
        }
        // 2. Podcast
        if (ld.podcast_script) {
            tabs.push({ id: 'podcast', label: translationService.t('student.tabs.podcast'), icon: '🎙️', desc: translationService.t('student.tabs.desc_podcast') });
        }
        // 3. Presentation
        if (ld.presentation) {
            tabs.push({ id: 'presentation', label: translationService.t('student.tabs.presentation'), icon: '📊', desc: translationService.t('student.tabs.desc_presentation') });
        }
        // 4. Flashcards
        if (ld.flashcards) {
            tabs.push({ id: 'flashcards', label: translationService.t('student.tabs.flashcards'), icon: '🗂️', desc: translationService.t('student.tabs.desc_flashcards') });
        }
        // 5. Mindmap
        if (ld.mindmap) {
            tabs.push({ id: 'mindmap', label: translationService.t('student.tabs.mindmap'), icon: '🧠', desc: translationService.t('student.tabs.desc_mindmap') });
        }
        // 6. Comic
        if (ld.comic) {
            tabs.push({ id: 'comic', label: translationService.t('student.tabs.comic'), icon: '💬', desc: translationService.t('student.tabs.desc_comic') });
        }
        // 7. Quiz / Test
        if (ld.quiz) {
            tabs.push({ id: 'quiz', label: translationService.t('student.tabs.quiz'), icon: '❓', desc: translationService.t('student.tabs.desc_quiz') });
        }
        if (ld.test) {
            tabs.push({ id: 'test', label: translationService.t('student.tabs.test'), icon: '📝', desc: translationService.t('student.tabs.desc_test') });
        }

        // 8. Whiteboard
        tabs.push({ id: 'whiteboard', label: translationService.t('student.tabs.whiteboard'), icon: '🎨', desc: translationService.t('student.tabs.desc_whiteboard') });

        // Always available tools
        tabs.push({ id: 'ai-assistant', label: translationService.t('student.tabs.ai_assistant'), icon: '🤖', desc: translationService.t('student.tabs.desc_ai_assistant') });

        return tabs;
    }

    render() {
        if (this.isLoading) {
            return html`
                <div class="flex justify-center items-center h-full pt-20">
                     <div class="spinner w-12 h-12 border-4 border-indigo-600 rounded-full animate-spin border-t-transparent"></div>
                </div>`;
        }

        if (!this.lessonData) {
            return html`<div class="p-8 text-center text-red-500">Nepodařilo se načíst lekci.</div>`;
        }

        const tabs = this._getTabs();

        return html`
            <div class="min-h-screen bg-slate-50 flex flex-col">

                <!-- Top Navigation Bar -->
                <div class="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
                    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div class="flex items-center justify-between h-16">

                            <div class="flex items-center gap-4">
                                <button @click=${this._handleBackToList} class="p-2 -ml-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-full transition-colors">
                                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                                </button>
                                <div>
                                    <h1 class="text-lg font-bold text-slate-800 line-clamp-1">${this.lessonData.title}</h1>
                                    <p class="text-xs text-slate-500 hidden sm:block">${this.lessonData.subtitle || this.lessonData.subject}</p>
                                </div>
                            </div>

                            <!-- Desktop Tabs -->
                            <div class="hidden md:flex space-x-1 overflow-x-auto custom-scrollbar">
                                ${tabs.map(tab => {
                                    const isActive = this.activeTabId === tab.id;
                                    const isCompleted = this._progress?.completedSections?.includes(tab.id);

                                    return html`
                                        <button @click=${() => this._switchTab(tab.id)}
                                            class="px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap
                                            ${isActive
                                                ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 shadow-sm'
                                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}">
                                            <span>${tab.icon}</span>
                                            <span>${tab.label}</span>
                                            ${isCompleted ? html`<span class="text-green-500 text-xs ml-1">✓</span>` : ''}
                                        </button>
                                    `;
                                })}
                            </div>

                            <!-- Mobile Menu Button -->
                            <div class="md:hidden flex items-center">
                                <span class="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                                    ${tabs.find(t => t.id === this.activeTabId)?.label}
                                </span>
                            </div>

                        </div>
                    </div>

                    <!-- Mobile Tabs Scrollable Strip -->
                    <div class="md:hidden border-t border-slate-100 overflow-x-auto custom-scrollbar py-2 px-4 flex gap-2">
                        ${tabs.map(tab => {
                             const isActive = this.activeTabId === tab.id;
                             return html`
                                <button @click=${() => this._switchTab(tab.id)}
                                    class="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap flex-shrink-0 flex items-center gap-1.5
                                    ${isActive
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : 'bg-white border border-slate-200 text-slate-600'}">
                                    <span>${tab.icon}</span>
                                    <span>${tab.label}</span>
                                </button>
                             `;
                        })}
                    </div>
                </div>

                <!-- Main Content Area -->
                <div class="flex-grow max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 animate-fade-in-up">
                    ${this._renderContent()}
                </div>

            </div>
        `;
    }

    _renderCompletionButton(sectionId, label = "Dokončit") {
        const isCompleted = this._progress?.completedSections?.includes(sectionId);

        return html`
            <div class="mt-12 flex justify-center pb-12">
                <button
                    @click=${() => this._markSectionComplete(sectionId)}
                    ?disabled=${isCompleted}
                    class="px-8 py-4 rounded-full font-bold shadow-xl transition-all transform active:scale-95 flex items-center gap-3 text-lg
                    ${isCompleted
                        ? 'bg-green-100 text-green-700 cursor-default shadow-none border border-green-200'
                        : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-indigo-200 hover:-translate-y-1'}"
                >
                    ${isCompleted
                        ? html`<span>Splněno</span> <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`
                        : html`<span>${label}</span> <span>✨</span>`}
                </button>
            </div>
        `;
    }

    _renderContent() {
        switch (this.activeTabId) {
            case 'study':
                return this._renderStudyRoom();
            case 'podcast':
                return html`
                    <student-podcast .podcastData=${this.lessonData.podcast_script} .audioPath=${this.lessonData.podcast_audio_path} @podcast-completed=${() => this._markSectionComplete('podcast')}></student-podcast>
                    ${this._renderCompletionButton('podcast', 'Podcast poslechnut')}
                `;
            case 'presentation':
                return html`
                    <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
                        <div class="flex items-center justify-between mb-6">
                            <h2 class="text-2xl font-bold text-slate-800">Prezentace</h2>
                            <span class="text-sm text-slate-500">${this.lessonData.presentation?.slides?.length || 0} slidů</span>
                        </div>
                        <div id="presentation-container" class="min-h-[400px]"></div>
                        ${this._renderCompletionButton('presentation', 'Prezentace prostudována')}
                    </div>
                `;
            case 'quiz':
                return html`
                    <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 sm:p-8">
                        <student-quiz .quizData=${this.lessonData.quiz} .lessonId=${this.lessonId} @quiz-completed=${() => this._markSectionComplete('quiz')}></student-quiz>
                    </div>`;
            case 'test':
                return html`
                    <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 sm:p-8">
                        <student-test .testData=${this.lessonData.test} .lessonId=${this.lessonId} @test-completed=${() => this._markSectionComplete('test')}></student-test>
                    </div>`;
            case 'flashcards':
                return html`
                    <div class="max-w-3xl mx-auto">
                        <flashcards-component .cards=${this.lessonData.flashcards} @flashcards-completed=${() => this._markSectionComplete('flashcards')}></flashcards-component>
                    </div>`;
            case 'mindmap':
                return html`
                    <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 sm:p-8">
                        <mindmap-component .code=${this.lessonData.mindmap}></mindmap-component>
                        ${this._renderCompletionButton('mindmap', 'Prostudováno')}
                    </div>`;
            case 'comic':
                return html`
                    <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 sm:p-8">
                        <student-comic .comicData=${this.lessonData.comic}></student-comic>
                        ${this._renderCompletionButton('comic', 'Přečteno')}
                    </div>`;
            case 'whiteboard':
                return html`
                    <div class="h-[calc(100vh-200px)] bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                        <magic-board-view .lessonId=${this.lessonId} .readOnly=${true}></magic-board-view>
                    </div>`;
            case 'ai-assistant':
                return html`
                    <div class="h-[calc(100vh-200px)] bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                        <chat-panel type="ai" .lessonId=${this.lessonId} .currentUserData=${this.currentUserData}></chat-panel>
                    </div>`;
            default:
                return html`<div class="text-center py-20 text-slate-500">Vyberte sekci z menu</div>`;
        }
    }

    _getNormalizedContent(content) {
        // Defensive Programming: Handle Null/Undefined
        if (!content) {
            return "";
        }

        // IF String: Proceed as normal
        if (typeof content === 'string') {
            return content;
        }

        // IF Object: Parse object back into a String
        if (typeof content === 'object') {
            // Scenario A: AI Schema (has sections array)
            if (Array.isArray(content.sections)) {
                return content.sections.map(section => {
                    const title = section.title ? `## ${section.title}` : '';
                    const body = section.content || '';
                    return `${title}\n\n${body}`;
                }).join('\n\n');
            }

            // Scenario B: Generic Object -> Safe Serialization
            try {
                return JSON.stringify(content, null, 2);
            } catch (e) {
                console.error("Error serializing content object:", e);
                return "Error displaying content.";
            }
        }

        // Fallback
        return String(content);
    }

    _renderStudyRoom() {
        // Content Normalization Layer
        const safeContent = this._getNormalizedContent(this.lessonData.text_content);

        return html`
            <div class="space-y-8 max-w-4xl mx-auto">

                <!-- 1. Text Content -->
                ${safeContent ? html`
                    <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 sm:p-12 relative overflow-hidden">
                        <div class="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-400 to-indigo-500"></div>
                        <h2 class="text-3xl font-extrabold text-slate-900 mb-8 flex items-center gap-3">
                            <span class="text-4xl">📖</span> Studijní text
                        </h2>
                        <div class="prose prose-lg prose-indigo max-w-none text-slate-600 leading-relaxed">
                            ${(typeof marked !== 'undefined')
                                ? html`<div .innerHTML=${marked.parse(safeContent)}></div>`
                                : html`<p>${safeContent}</p>`}
                        </div>
                    </div>
                ` : ''}

                <!-- 2. Video -->
                ${this.lessonData.youtube_link ? html`
                    <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8">
                        <h3 class="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                            <span>🎬</span> Video
                        </h3>
                        <div class="aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-lg">
                            ${(() => {
                                const videoIdMatch = this.lessonData.youtube_link.match(/(?:v=|\/embed\/|\.be\/)([\w-]{11})/);
                                return videoIdMatch && videoIdMatch[1]
                                    ? html`<iframe class="w-full h-full" src="https://www.youtube.com/embed/${videoIdMatch[1]}" frameborder="0" allowfullscreen></iframe>`
                                    : html`<div class="flex items-center justify-center h-full text-white">Invalid Video URL</div>`;
                            })()}
                        </div>
                    </div>
                ` : ''}

                ${this._renderCompletionButton('study', 'Mám prostudováno')}
            </div>
        `;
    }
}

customElements.define('student-lesson-detail', StudentLessonDetail);
