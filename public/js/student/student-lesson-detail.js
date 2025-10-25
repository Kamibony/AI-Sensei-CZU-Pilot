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
        try {
            const docRef = doc(firebaseInit.db, "lessons", this.lessonId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                this.lessonData = normalizeLessonData(docSnap.data());
                this._buildAvailableTabs();
                if (this.availableTabs.length > 0) {
                    this.activeTabId = this.availableTabs[0].id;
                }
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
        // Pôvodná logika z `renderLessonTabs`
        const tabs = [];
        if (this.lessonData.text_content) tabs.push({ id: 'text', name: 'Text' });
        if (this.lessonData.youtube_link) tabs.push({ id: 'video', name: 'Video' });
        if (this.lessonData.presentation) tabs.push({ id: 'presentation', name: 'Prezentace' });
        if (this.lessonData.quiz) tabs.push({ id: 'quiz', name: 'Kvíz' });
        if (this.lessonData.test) tabs.push({ id: 'test', name: 'Test' });
        if (this.lessonData.podcast_script) tabs.push({ id: 'podcast', name: 'Podcast' });
        tabs.push({ id: 'ai-assistant', name: 'AI Asistent' });
        tabs.push({ id: 'professor-chat', name: 'Konzultace' });
        
        this.availableTabs = tabs;
    }

    _handleBackClick() {
        // Vypálime udalosť, že sa chceme vrátiť späť
        const event = new CustomEvent('back-to-list', { bubbles: true, composed: true });
        this.dispatchEvent(event);
    }

    _handleTabClick(tabId) {
        // Zastavíme podcast, ak beží
        if (window.speechSynthesis && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        this.activeTabId = tabId;
    }

    render() {
        if (this.isLoading) {
            return html`<div class="text-center text-slate-500">Načítání lekce...</div>`;
        }

        if (!this.lessonData) {
            return html`<p class="text-red-500">Nepodařilo se načíst lekci.</p>`;
        }

        return html`
            <div class="mb-6">
                <button @click=${this._handleBackClick} class="text-green-700 hover:underline flex items-center">
                    &larr; Zpět na přehled lekcí
                </button>
            </div>
            <div class="bg-white p-4 md:p-8 rounded-2xl shadow-lg mb-6">
                <h2 class="text-2xl md:text-3xl font-bold mb-4">${this.lessonData.title}</h2>
                
                <div id="lesson-tabs" class="mb-4 md:mb-6 flex flex-wrap gap-2">
                    ${this.availableTabs.map(tab => html`
                        <button 
                            id="${tab.id}-tab"
                            class="px-4 py-2 md:px-5 md:py-2.5 font-semibold transition-all rounded-full text-sm md:text-base flex-shrink-0 
                                ${this.activeTabId === tab.id 
                                    ? 'bg-green-700 text-white shadow-md' 
                                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}"
                            @click=${() => this._handleTabClick(tab.id)}>
                            ${tab.name}
                        </button>
                    `)}
                </div>
                
                <div id="lesson-tab-content" class="mt-4">
                    ${this._renderTabContent()}
                </div>
            </div>
        `;
    }

    _renderTabContent() {
        // Pôvodná logika z `switchTab`
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
                // Skontrolujeme, či `marked` existuje (načítal sa zo scriptu v index.html)
                if (typeof marked === 'undefined') {
                    console.error("Knižnica marked.js nie je načítaná!");
                    return html`<p class="text-red-500">Chyba: Nepodarilo sa spracovať formátovanie textu.</p>`;
                }
                const textContentDiv = document.createElement('div');
                textContentDiv.className = "prose max-w-none"; // 'prose' je dôležité pre Tailwind
                // Prevedieme Markdown na HTML a vložíme ho
                // marked.parse() automaticky spracuje aj \n (väčšinou)
                textContentDiv.innerHTML = marked.parse(this.lessonData.text_content || ''); 
                return html`${textContentDiv}`;
                // ====================================================================
                
            case 'video':
                const videoIdMatch = this.lessonData.youtube_link ? this.lessonData.youtube_link.match(/(?:v=|\/embed\/|\.be\/)([\w-]{11})/) : null;
                if (videoIdMatch && videoIdMatch[1]) {
                    return html`<iframe class="w-full aspect-video rounded-lg" src="https://www.youtube.com/embed/${videoIdMatch[1]}" frameborder="0" allowfullscreen></iframe>`;
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
