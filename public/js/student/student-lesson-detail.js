// Súbor: public/js/student/student-lesson-detail.js

import { LitElement, html } from 'https://cdn.skypack.dev/lit';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as firebaseInit from '../firebase-init.js';
import { renderPresentation } from './presentation-handler.js';

// Musíme importovať všetky komponenty, ktoré tento komponent bude renderovať
import './quiz-component.js';
import './test-component.js';
import './podcast-component.js';
import './chat-panel.js';

// Presunutá funkcia z student.js
function normalizeLessonData(rawData) {
    const normalized = { ...rawData };
    normalized.youtube_link = rawData.youtube_link || rawData.videoUrl || null;
    normalized.presentation = rawData.presentation || rawData.presentationData || null;
    normalized.podcast_script = rawData.podcast_script || rawData.post || rawData.postData || null;
    normalized.text_content = rawData.text_content || rawData.content || null;
    normalized.quiz = rawData.quiz || rawData.quizData || null;
    normalized.test = rawData.test || rawData.testData || null;
    return normalized;
}

export class StudentLessonDetail extends LitElement {

    static get properties() {
        return {
            lessonId: { type: String },
            currentUserData: { type: Object },
            lessonData: { type: Object, state: true },
            availableTabs: { type: Array, state: true },
            activeTabId: { type: String, state: true },
            isLoading: { type: Boolean, state: true },
            _viewMode: { type: String, state: true } // 'hub' or 'content'
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
    }

    createRenderRoot() {
        return this;
    }

    willUpdate(changedProperties) {
        if (changedProperties.has('lessonId') && this.lessonId) {
            this._fetchLessonDetail();
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

    _buildAvailableTabs() {
        // Build tab list with metadata for the Hub
        const tabs = [];

        // Helper to add tabs
        const addTab = (id, name, icon, description, colorClass) => {
            tabs.push({ id, name, icon, description, colorClass });
        };

        if (this.lessonData.text_content)
            addTab('text', 'Studijní Text', '📝', 'Přečtěte si látku k lekci', 'bg-blue-50 text-blue-600');

        if (this.lessonData.youtube_link)
            addTab('video', 'Video', '🎬', 'Sledujte video výklad', 'bg-red-50 text-red-600');

        if (this.lessonData.presentation)
            addTab('presentation', 'Prezentace', '📊', 'Prohlédněte si slidy', 'bg-orange-50 text-orange-600');

        if (this.lessonData.podcast_script)
            addTab('podcast', 'Podcast', '🎙️', 'Poslechněte si audio verzi', 'bg-purple-50 text-purple-600');

        if (this.lessonData.quiz)
            addTab('quiz', 'Kvíz', '❓', 'Otestujte své znalosti', 'bg-green-50 text-green-600');

        if (this.lessonData.test)
            addTab('test', 'Test', '📝', 'Závěrečný test lekce', 'bg-emerald-50 text-emerald-600');

        // Always available tools
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
        return html`
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <!-- Header -->
                <div class="mb-8">
                    <button @click=${this._handleBackToList} class="mb-4 text-slate-500 hover:text-indigo-600 flex items-center transition-colors">
                        <span class="mr-2">←</span> Zpět do knihovny
                    </button>
                    <h1 class="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight mb-2">${this.lessonData.title}</h1>
                    ${this.lessonData.subtitle ? html`<p class="text-lg text-slate-500 max-w-3xl">${this.lessonData.subtitle}</p>` : ''}
                </div>

                <!-- Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${this.availableTabs.map(tab => html`
                        <div @click=${() => this._handleHubItemClick(tab.id)}
                             class="group bg-white rounded-3xl p-6 shadow-sm hover:shadow-xl border border-slate-100 cursor-pointer transition-all duration-300 transform hover:-translate-y-1">

                            <div class="flex items-start justify-between mb-6">
                                <div class="w-16 h-16 rounded-2xl ${tab.colorClass} flex items-center justify-center text-3xl shadow-sm group-hover:scale-110 transition-transform duration-300">
                                    ${tab.icon}
                                </div>
                                <div class="bg-slate-50 text-slate-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                    ✨ Začít
                                </div>
                            </div>

                            <h3 class="text-xl font-bold text-slate-800 mb-2 group-hover:text-indigo-600 transition-colors">${tab.name}</h3>
                            <p class="text-slate-500 text-sm leading-relaxed">${tab.description}</p>
                        </div>
                    `)}
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
            return html`<div id="presentation-container"></div>`;
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
                return html`${textContentDiv}`;
                
            case 'video':
                const videoIdMatch = this.lessonData.youtube_link ? this.lessonData.youtube_link.match(/(?:v=|\/embed\/|\.be\/)([\w-]{11})/) : null;
                if (videoIdMatch && videoIdMatch[1]) {
                    return html`
                        <div class="aspect-video w-full rounded-2xl overflow-hidden shadow-lg">
                            <iframe class="w-full h-full" src="https://www.youtube.com/embed/${videoIdMatch[1]}" frameborder="0" allowfullscreen></iframe>
                        </div>`;
                } else {
                    return html`<p class="text-red-500">Neplatný nebo chybějící YouTube odkaz.</p>`;
                }
            case 'quiz':
                return html`<student-quiz .quizData=${this.lessonData.quiz} .lessonId=${this.lessonId}></student-quiz>`;
            case 'test':
                return html`<student-test .testData=${this.lessonData.test} .lessonId=${this.lessonId}></student-test>`;
            case 'podcast':
                return html`<student-podcast .podcastData=${this.lessonData.podcast_script}></student-podcast>`;
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
