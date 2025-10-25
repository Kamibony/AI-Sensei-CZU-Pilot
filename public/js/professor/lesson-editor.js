// Súbor: public/js/professor/lesson-editor.js

import { LitElement, html } from 'https://cdn.skypack.dev/lit';
import { doc, addDoc, updateDoc, collection, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import * as firebaseInit from '../firebase-init.js';
import { showToast } from '../utils.js';
// ==== OPRAVENÝ IMPORT ====
// Importujeme funkcie z upload-handleru, ktoré budeme potrebovať
import { renderSelectedFiles, clearSelectedFiles, getSelectedFiles, renderMediaLibraryFiles, loadSelectedFiles } from '../upload-handler.js';
// ========================

// Lazy load pre Cloud Function (zostáva rovnaká logika)
let generateContentCallable = null;
function getGenerateContentCallable() {
    if (!generateContentCallable) {
        if (!firebaseInit.functions) {
            console.error("Firebase Functions not initialized when trying to get generateContent callable");
            throw new Error("Firebase Functions not initialized.");
        }
        generateContentCallable = httpsCallable(firebaseInit.functions, 'generateContent');
    }
    return generateContentCallable;
}

export class LessonEditor extends LitElement {

    // --- Definícia vlastností (Properties & State) ---
    static get properties() {
        return {
            lesson: { type: Object }, // Lekcia, ktorú editujeme (alebo null pre novú)
            
            _currentLessonData: { type: Object, state: true }, // Interná kópia, s ktorou pracujeme
            _activeView: { type: String, state: true }, // Ktorá sekcia editora je aktívna ('details', 'text', ...)
            _lastGeneratedData: { type: Object, state: true }, // Posledný vygenerovaný obsah AI
            _isGenerating: { type: Boolean, state: true }, // Indikátor, či AI práve generuje
            _isSaving: { type: Boolean, state: true }, // Indikátor ukladania
            _isDeleting: { type: Boolean, state: true }, // Indikátor mazania
        };
    }

    constructor() {
        super();
        this.lesson = null; // Vstupný prop
        
        // Interný stav odvodený z prop 'lesson'
        this._currentLessonData = null; 
        this._activeView = 'details';
        this._lastGeneratedData = null;
        this._isGenerating = false;
        this._isSaving = false;
        this._isDeleting = false;
    }

    // --- Lifecycle metódy ---

    // Keď sa komponent prvýkrát pripojí k DOM
    connectedCallback() {
        super.connectedCallback();
        // Vytvoríme internú kópiu lekcie a načítame RAG súbory
        this._initializeEditorState();
    }

    // Keď sa zmení vstupný prop 'lesson' (napr. pri výbere inej lekcie)
    willUpdate(changedProperties) {
        if (changedProperties.has('lesson')) {
            this._initializeEditorState();
        }
    }
    
    // Spoločná inicializačná logika
    _initializeEditorState() {
        // Vytvoríme hlbokú kópiu, aby sme nemodifikovali originál
        this._currentLessonData = this.lesson ? JSON.parse(JSON.stringify(this.lesson)) : null;
        this._lastGeneratedData = null;
        this._activeView = 'details'; // Vždy začneme na detailoch
        
        // Načítame RAG súbory z lekcie (alebo prázdne pole)
        // loadSelectedFiles nastaví interný stav v upload-handler.js
        loadSelectedFiles(this._currentLessonData?.ragFilePaths || []);
    }

    // Vypnutie Shadow DOM pre dedenie Tailwind štýlov
    createRenderRoot() {
        return this;
    }

    // --- Renderovacie metódy ---

    // Hlavná render metóda komponentu
    render() {
        return html`
            <div class="flex flex-col md:flex-row h-full">
                <aside class="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
                    ${this._renderHeader()}
                    ${this._renderSideMenu()}
                </aside>
                <main class="flex-grow bg-slate-50 overflow-y-auto">
                    <div class="p-4 sm:p-6 md:p-8 h-full" id="editor-content-container">
                        ${this._renderActiveViewContent()}
                    </div>
                </main>
            </div>
        `;
    }

    // Renderuje hlavičku s tlačidlom späť a názvom lekcie
    _renderHeader() {
        const title = this._currentLessonData ? this._currentLessonData.title : 'Vytvořit novou lekci';
        const icon = this._currentLessonData?.icon || '🆕';
        return html`
            <header class="p-4 border-b border-slate-200 flex-shrink-0">
                <button @click=${this._handleBackClick} class="flex items-center text-sm text-green-700 hover:underline mb-3">
                    &larr; Zpět na plán výuky
                </button>
                <div class="flex justify-between items-start">
                    <div class="flex items-center space-x-3 min-w-0"> {/* Pridané min-w-0 pre zalomenie */}
                        <span class="text-3xl flex-shrink-0">${icon}</span>
                        <h2 id="editor-lesson-title" class="text-xl font-bold truncate text-slate-800" title=${title}>${title}</h2>
                    </div>
                    <button @click=${this._handleDownloadLessonContent} title="Stáhnout obsah lekce" class="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2 2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </button>
                </div>
            </header>
        `;
    }

    // Renderuje ľavé navigačné menu
    _renderSideMenu() {
        const menuItems = [
            { id: 'details', label: 'Detaily lekce', icon: '📝' },
            { id: 'text', label: 'Text pro studenty', icon: '✍️' },
            { id: 'presentation', label: 'Prezentace', icon: '🖼️' },
            { id: 'video', label: 'Video', icon: '▶️' },
            { id: 'quiz', label: 'Kvíz', icon: '❓' },
            { id: 'test', label: 'Test', icon: '✅' },
            { id: 'post', label: 'Podcast Skript', icon: '🎙️' }, 
        ];

        return html`
            <div class="flex-grow overflow-y-auto p-2">
                <nav id="editor-vertical-menu" class="flex flex-col space-y-1">
                    ${menuItems.map(item => html`
                        <a href="#" 
                           data-view="${item.id}" 
                           class="editor-menu-item flex items-center p-3 text-sm font-medium rounded-md hover:bg-slate-100 transition-colors ${this._activeView === item.id ? 'bg-green-100 text-green-800 font-semibold' : ''}"
                           @click=${(e) => this._handleMenuClick(e, item.id)}>
                            ${item.icon}<span class="ml-3">${item.label}</span>
                        </a>
                    `)}
                </nav>
            </div>`;
    }

    // Rozhoduje, ktorý obsah zobraziť na základe `_activeView`
    _renderActiveViewContent() {
        const titleMapping = {
            'details': 'Detaily lekce',
            'text': 'Text pro studenty',
            'presentation': 'AI Prezentace',
            'video': 'Vložení videa',
            'quiz': 'Interaktivní Kvíz',
            'test': 'Pokročilý Test',
            'post': 'Podcast Skript',
        };
        const title = titleMapping[this._activeView] || 'Neznámá sekce';

        const fieldMapping = { 
            'text': 'text_content', 
            'presentation': 'presentation', 
            'quiz': 'quiz', 
            'test': 'test', 
            'post': 'podcast_script',
            'video': 'videoUrl'
        };
        const currentField = fieldMapping[this._activeView];
        const hasSavedContent = this._currentLessonData && this._currentLessonData[currentField];

        // Hlavný wrapper pre obsah
        const renderWrapper = (content, actions = '') => html`
            <div class="flex justify-between items-start mb-6">
                <h2 class="text-3xl font-extrabold text-slate-800">${title}</h2>
                <div>${actions}</div>
            </div>
            <div class="bg-white p-6 rounded-2xl shadow-lg">${content}</div>`;

        // Akcia na zmazanie existujúceho obsahu
        const deleteButton = html`
            <button 
                id="delete-content-btn" 
                data-field="${currentField}" 
                class="px-4 py-2 text-sm font-semibold text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors flex items-center gap-2 ${this._isDeleting ? 'opacity-50 cursor-not-allowed' : ''}"
                @click=${() => this._handleDeleteGeneratedContent(currentField, this._activeView)}
                .disabled=${this._isDeleting}>
                ${this._isDeleting ? html`<div class="spinner-dark-small"></div> Mazání...` : '🗑️ Smazat a vytvořit nový'}
            </button>`;

        // Zobrazenie pre jednotlivé sekcie
        switch(this._activeView) {
            case 'details':
                return renderWrapper(this._renderDetailsForm());
            case 'video':
                // Video má špeciálnu logiku (nemá generátor)
                return renderWrapper(this._renderVideoEditor(), hasSavedContent ? deleteButton : '');
            
            // Ostatné sekcie majú podobnú štruktúru:
            case 'text':
            case 'presentation':
            case 'quiz':
            case 'test':
            case 'post':
                if (hasSavedContent) {
                    return renderWrapper(this._renderSavedContent(this._activeView, this._currentLessonData[currentField]), deleteButton);
                } else {
                    return renderWrapper(this._renderGeneratorForm(this._activeView));
                }

            default:
                return renderWrapper(html`<div class="text-center p-8 text-slate-400">Tato sekce se připravuje.</div>`);
        }
    }

    // --- Špecifické render metódy pre jednotlivé sekcie ---

    _renderDetailsForm() {
        return html`
            <div id="lesson-details-form" class="space-y-4">
                <div>
                    <label class="block font-medium text-slate-600">Název lekce</label>
                    <input type="text" id="lesson-title-input" class="w-full border-slate-300 rounded-lg p-2 mt-1 focus:ring-green-500 focus:border-green-500" 
                           .value=${this._currentLessonData?.title || ''} placeholder="Např. Úvod do organické chemie">
                </div>
                <div>
                    <label class="block font-medium text-slate-600">Podtitulek</label>
                    <input type="text" id="lesson-subtitle-input" class="w-full border-slate-300 rounded-lg p-2 mt-1" 
                           .value=${this._currentLessonData?.subtitle || ''} placeholder="Základní pojmy a principy">
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block font-medium text-slate-600">Číslo lekce</label>
                        <input type="text" id="lesson-number-input" class="w-full border-slate-300 rounded-lg p-2 mt-1" 
                               .value=${this._currentLessonData?.number || ''} placeholder="Např. 101">
                    </div>
                    <div>
                        <label class="block font-medium text-slate-600">Ikona</label>
                        <input type="text" id="lesson-icon-input" class="w-full border-slate-300 rounded-lg p-2 mt-1" 
                               .value=${this._currentLessonData?.icon || '🆕'} placeholder="🆕">
                    </div>
                </div>
                ${this._renderDocumentSelector()} {/* RAG selector */}
                <div class="text-right pt-4">
                    <button id="save-lesson-btn" 
                            class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105 ${this._isSaving ? 'opacity-50 cursor-not-allowed' : ''}"
                            @click=${this._handleSaveLessonDetails}
                            .disabled=${this._isSaving}>
                        ${this._isSaving ? html`<div class="spinner"></div> Ukládání...` : 'Uložit změny'}
                    </button>
                </div>
            </div>`;
    }

    _renderVideoEditor() {
        const videoUrl = this._currentLessonData?.videoUrl || '';
        return html`
            <p class="text-slate-500 mb-4">Vložte odkaz na video z YouTube.</p>
            <div>
                <label class="block font-medium text-slate-600">YouTube URL</label>
                <input id="youtube-url" type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1" 
                       .value=${videoUrl} placeholder="https://www.youtube.com/watch?v=...">
            </div>
            <div class="text-right pt-4">
                <button id="embed-video-btn" 
                        class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 ${this._isSaving ? 'opacity-50 cursor-not-allowed' : ''}"
                        @click=${this._handleEmbedVideo}
                        .disabled=${this._isSaving}>
                    ${this._isSaving ? html`<div class="spinner"></div> Ukládání...` : 'Uložit odkaz'}
                </button>
            </div>
            <div id="video-preview" class="mt-6 border-t pt-6">
                ${this._renderVideoPreview(videoUrl)}
            </div>`;
    }
    
    _renderVideoPreview(url) {
         if (!url) {
            return html`<div class="text-center p-8 text-slate-400">Náhled videa se zobrazí zde...</div>`;
        }
        const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?#]+)/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;
        if (videoId) {
            return html`<div class="rounded-xl overflow-hidden aspect-video mx-auto max-w-2xl shadow-lg"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen class="w-full h-full"></iframe></div>`;
        } else {
            return html`<div class="p-4 bg-red-100 text-red-700 rounded-lg text-center">Neplatná YouTube URL.</div>`;
        }
    }

    // Vykreslí formulár pre generátor AI obsahu
    _renderGeneratorForm(viewId) {
        let formContent;
        let promptPlaceholder = "Zadejte AI prompt...";
        let defaultPrompt = '';
        
        const fieldMapping = { 
            'text': 'text_content', 
            'presentation': 'presentation', 
            'quiz': 'quiz', 
            'test': 'test', 
            'post': 'podcast_script'
        };

        switch(viewId) {
            case 'text':
                promptPlaceholder = "Např. 'Vytvoř poutavý úvodní text o historii kvantové mechaniky...'";
                formContent = html`<textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder=${promptPlaceholder}></textarea>`;
                break;
            case 'presentation':
                 promptPlaceholder = "Např. Klíčové momenty Římské republiky";
                 formContent = html`
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div class="md:col-span-2">
                            <label class="block font-medium text-slate-600">Téma prezentace</label>
                            <input id="prompt-input" type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1" placeholder=${promptPlaceholder}>
                        </div>
                        <div>
                            <label class="block font-medium text-slate-600">Počet slidů</label>
                            <input id="slide-count-input" type="number" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="5">
                        </div>
                    </div>
                    <div class="mb-4">
                        <label for="presentation-style-selector" class="block text-sm font-medium text-gray-700 mb-1">Styl prezentace:</label>
                        <select id="presentation-style-selector" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md" .value=${this._currentLessonData?.presentation?.styleId || 'default'}>
                            <option value="default">Výchozí (Zelená)</option>
                            <option value="modern">Moderní (Modrá)</option>
                            <option value="vibrant">Živý (Oranžová)</option>
                        </select>
                    </div>`;
                break;
            case 'quiz':
                 promptPlaceholder = "Např. 'Vytvoř 3 otázky s výběrem ze 4 možností na téma fotosyntéza...'";
                 formContent = html`<textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder=${promptPlaceholder}></textarea>`;
                 break;
            case 'test':
                 promptPlaceholder = "Zadejte hlavní téma testu, např. 'Základy buněčné biologie'";
                 formContent = html`
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                            <label class="block font-medium text-slate-600">Počet otázek</label>
                            <input id="question-count-input" type="number" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="5">
                        </div>
                        <div>
                            <label class="block font-medium text-slate-600">Obtížnost</label>
                            <select id="difficulty-select" class="w-full border-slate-300 rounded-lg p-2 mt-1">
                                <option>Lehká</option>
                                <option selected>Střední</option>
                                <option>Těžká</option>
                            </select>
                        </div>
                        <div>
                            <label class="block font-medium text-slate-600">Typy otázek</label>
                            <select id="type-select" class="w-full border-slate-300 rounded-lg p-2 mt-1">
                                <option value="Multiple Choice">Výběr z možností</option>
                                {/* Ďalšie typy môžu byť pridané neskôr */}
                            </select>
                        </div>
                    </div>
                    <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder=${promptPlaceholder}></textarea>`;
                 break;
            case 'post': // Podcast
                promptPlaceholder = "Zadejte hlavní téma...";
                defaultPrompt = `Prozkoumej klíčové koncepty z lekce "${this._currentLessonData?.title || 'aktuální lekce'}"`;
                formContent = html`
                    <div class="bg-slate-50 p-4 rounded-lg">
                        <h4 class="font-bold text-slate-800 mb-3">🎙️ Generátor Podcastové Série</h4>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label class="block font-medium text-slate-600 text-sm">Počet epizod</label>
                                <input id="episode-count-input" type="number" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="3">
                            </div>
                            {/* Hlas/Jazyk - zatiaľ nepodporované */}
                        </div>
                        <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-20" placeholder=${promptPlaceholder}>${defaultPrompt}</textarea>
                    </div>`;
                break;
            default:
                formContent = html`<p class="text-red-500">Neznámý typ generátoru.</p>`;
        }
        
        return html`
            <p class="text-slate-500 mb-4">Zadejte AI prompt a vygenerujte obsah. Můžete vybrat dokumenty (RAG).</p>
            ${this._renderDocumentSelector()}
            ${formContent}
            <div class="flex items-center justify-end mt-4">
                <button id="generate-btn" 
                        class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ai-glow ${this._isGenerating ? 'opacity-50 cursor-not-allowed' : ''}"
                        @click=${() => this._handleGeneration(this._activeView)}
                        .disabled=${this._isGenerating}>
                    ${this._isGenerating ? html`<div class="spinner"></div> Generuji...` : html`✨<span class="ml-2">Generovat ${viewId}</span>`}
                </button> 
            </div>
            <div id="generation-output" class="mt-6 border-t pt-6">
                ${this._lastGeneratedData 
                    ? this._renderGeneratedContent(this._activeView, this._lastGeneratedData)
                    : html`<div class="text-center p-8 text-slate-400">Obsah se vygeneruje zde...</div>`
                }
            </div>
            ${this._lastGeneratedData ? html`
                <div class="text-right mt-4">
                    <button id="save-content-btn" 
                            data-field=${fieldMapping[viewId]} 
                            class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105 ${this._isSaving ? 'opacity-50 cursor-not-allowed' : ''}"
                            @click=${() => this._handleSaveGeneratedContent(fieldMapping[viewId], this._lastGeneratedData)}
                            .disabled=${this._isSaving}>
                         ${this._isSaving ? html`<div class="spinner"></div> Ukládání...` : 'Uložit do lekce'}
                    </button>
                </div>` 
            : ''}`;
    }

    // Renderuje zobrazenie pre už uložený obsah
    _renderSavedContent(viewId, data) {
        // Použijeme pôvodnú funkciu z editor-handler.js na renderovanie náhľadu
        const contentHtml = this._renderGeneratedContent(viewId, data);
        return html`${contentHtml}`; // Lit priamo spracuje TemplateResult
    }

    // Renderuje UI pre výber RAG dokumentov
    _renderDocumentSelector() {
        // Timeout je potrebný, aby sa najprv vyrenderoval HTML a až potom sa volal renderSelectedFiles()
        // z upload-handler.js, ktorý manipuluje s DOM elementom #selected-files-list-rag
        setTimeout(() => {
             const listElement = this.querySelector('#selected-files-list-rag');
             // Ak element existuje, zavoláme renderSelectedFiles
             if (listElement) {
                 renderSelectedFiles('selected-files-list-rag');
             } else {
                 // Ak element ešte neexistuje (napr. pri prvom renderovaní), skúsime znova o chvíľu
                 // Toto nie je ideálne, lepšie by bolo mať RAG selector ako vlastný komponent
                 setTimeout(() => {
                     const listElementRetry = this.querySelector('#selected-files-list-rag');
                     if (listElementRetry) {
                         renderSelectedFiles('selected-files-list-rag');
                     } else {
                          console.warn("Element #selected-files-list-rag not found after timeout.");
                     }
                 }, 100);
             }
        }, 0); 
        
        return html`
            <div class="mb-4">
                <label class="block font-medium text-slate-600 mb-2">Vyberte kontextové dokumenty (RAG):</label>
                <div class="space-y-2 border rounded-lg p-3 bg-slate-50">
                    <ul id="selected-files-list-rag" class="text-xs text-slate-600 mb-2 list-disc list-inside">
                        <li>Načítání...</li> {/* renderSelectedFiles to prepíše */}
                    </ul>
                    <button id="select-files-btn-rag" 
                            class="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-1 px-2 rounded-md"
                            @click=${this._handleOpenMediaLibrary}>
                        Vybrat soubory z knihovny
                    </button>
                </div>
                <p class="text-xs text-slate-400 mt-1">Vybrané dokumenty budou použity jako dodatečný kontext pro AI.</p>
            </div>`;
    }
    
    // Vykreslí náhľad vygenerovaného/uloženého obsahu (preberá logiku z pôvodnej renderGeneratedContent)
    _renderGeneratedContent(viewId, data) {
        if (!data) return html`<div class="p-4 bg-red-100 text-red-700 rounded-lg">Chyba: Nebyla přijata žádná data.</div>`;
    
        try {
            switch(viewId) {
                case 'text':
                    const textContent = (typeof data === 'string') ? data : data.text;
                    if (typeof textContent !== 'string') throw new Error("Neplatný text.");
                    // Vytvoríme pre element pre bezpečné vloženie HTML (ak by AI vrátila HTML tagy)
                    const pre = document.createElement('pre');
                    pre.className = "whitespace-pre-wrap font-sans text-sm";
                    pre.textContent = textContent; // Použijeme textContent pre bezpečnosť
                    return html`${pre}`;
                case 'presentation':
                    const slides = data?.slides || [];
                    const styleId = data?.styleId || this.querySelector('#presentation-style-selector')?.value || 'default';
                    if (!Array.isArray(slides)) throw new Error("Neplatné pole 'slides'.");
                    return slides.map((slide, i) => html`
                        <div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm bg-slate-50 relative">
                            <h4 class="font-bold text-green-700">Slide ${i+1}: ${slide.title || 'Bez názvu'}</h4>
                            <ul class="list-disc list-inside mt-2 text-sm text-slate-600">
                                ${(slide.points || []).map(p => html`<li>${p}</li>`)}
                            </ul>
                            <span class="style-indicator text-xs font-mono text-gray-400 absolute top-1 right-2">${styleId}</span>
                        </div>`);
                case 'quiz':
                case 'test':
                    const questions = data?.questions || [];
                    if (!Array.isArray(questions)) throw new Error("Neplatné pole 'questions'.");
                    return questions.map((q, i) => html`
                        <div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm">
                            <h4 class="font-bold text-green-700">Otázka ${i+1}: ${q.question_text || 'Chybějící text'}</h4>
                            <div class="mt-2 space-y-2">
                                ${(q.options || []).map((opt, j) => html`
                                    <div class="text-sm p-2 rounded-lg ${j === q.correct_option_index ? 'bg-green-100 font-semibold' : 'bg-slate-50'}">${opt}</div>
                                `)}
                            </div>
                        </div>`);
                case 'post': // Podcast
                    const episodes = data?.episodes || [];
                    if (!Array.isArray(episodes)) throw new Error("Neplatné pole 'episodes'.");
                    return episodes.map((episode, i) => html`
                        <div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm">
                            <h4 class="font-bold text-green-700">Epizoda ${i+1}: ${episode.title || 'Bez názvu'}</h4>
                            <pre class="mt-2 text-sm text-slate-600 whitespace-pre-wrap font-sans">${episode.script || ''}</pre>
                        </div>`);
                default:
                    return html`<div class="p-4 bg-yellow-100 text-yellow-700 rounded-lg">Neznámý typ obsahu '${viewId}'.</div>`;
            }
        } catch(e) {
            console.error("Error rendering generated content:", e, "Data:", data);
            return html`<div class="p-4 bg-red-100 text-red-700 rounded-lg">Chyba při zobrazování obsahu: ${e.message}</div>`;
        }
    }


    // --- Handlery udalostí ---

    _handleBackClick() {
        // Vypálime udalosť, že sa editor má zavrieť
        const event = new CustomEvent('editor-closed', { bubbles: true, composed: true });
        this.dispatchEvent(event);
    }
    
    _handleMenuClick(event, viewId) {
        event.preventDefault();
        if (this._activeView !== viewId) {
            this._activeView = viewId;
            this._lastGeneratedData = null; // Resetujeme generované dáta pri prepnutí
            // Pri prepnutí VIEW musíme znova načítať/nastaviť RAG súbory pre upload-handler
            loadSelectedFiles(this._currentLessonData?.ragFilePaths || []);
        }
    }

    _handleOpenMediaLibrary() {
        const modal = document.getElementById('media-library-modal');
        const modalConfirm = document.getElementById('modal-confirm-btn');
        const modalCancel = document.getElementById('modal-cancel-btn');
        const modalClose = document.getElementById('modal-close-btn');

        if (!modal || !modalConfirm || !modalCancel || !modalClose) {
            console.error("Chybějící elementy pro modální okno.");
            showToast("Chyba: Nepodařilo se načíst komponentu pro výběr souborů.", true);
            return;
        }
        
        // Funkcia, ktorá sa zavolá pri potvrdení výberu
        const handleConfirm = () => {
            renderSelectedFiles('selected-files-list-rag'); // Aktualizujeme zoznam v tomto komponente
            closeModal();
        };
        
        // Funkcia pre zrušenie/zatvorenie
        const handleCancel = () => closeModal();
        
        // Funkcia na zatvorenie modálu a odstránenie listenerov
        const closeModal = () => {
            modal.classList.add('hidden');
            modalConfirm.removeEventListener('click', handleConfirm);
            modalCancel.removeEventListener('click', handleCancel);
            modalClose.removeEventListener('click', handleCancel);
        };

        // Načítame a zobrazíme súbory v modálnom okne
        renderMediaLibraryFiles("main-course", "modal-media-list"); 
        
        // Priradíme listenery
        modalConfirm.addEventListener('click', handleConfirm);
        modalCancel.addEventListener('click', handleCancel);
        modalClose.addEventListener('click', handleCancel);
        
        // Zobrazíme modál
        modal.classList.remove('hidden');
    }

    async _handleSaveLessonDetails() {
        const titleInput = this.querySelector('#lesson-title-input');
        const subtitleInput = this.querySelector('#lesson-subtitle-input');
        const numberInput = this.querySelector('#lesson-number-input');
        const iconInput = this.querySelector('#lesson-icon-input');
        
        if (!titleInput) return showToast("Chyba: Chybí název lekce.", true);

        const title = titleInput.value.trim();
        if (!title) return showToast("Název lekce nemůže být prázdný.", true);

        const currentSelection = getSelectedFiles(); // Aktuálny RAG výber z upload-handler.js

        const lessonData = {
            title: title,
            subtitle: subtitleInput ? subtitleInput.value.trim() : '',
            number: numberInput ? numberInput.value.trim() : '',
            icon: iconInput ? (iconInput.value.trim() || '🆕') : '🆕',
            ragFilePaths: currentSelection, // Uložíme pole objektov { name, fullPath }
            updatedAt: serverTimestamp() 
        };

        this._isSaving = true;
        try {
            let lessonIdToUpdate;
            if (this._currentLessonData && this._currentLessonData.id) {
                // Aktualizácia existujúcej
                lessonIdToUpdate = this._currentLessonData.id;
                await updateDoc(doc(firebaseInit.db, 'lessons', lessonIdToUpdate), lessonData);
                showToast("Detaily lekce byly úspěšně aktualizovány.");
            } else {
                // Vytvorenie novej
                lessonData.createdAt = serverTimestamp(); 
                const docRef = await addDoc(collection(firebaseInit.db, 'lessons'), lessonData);
                lessonIdToUpdate = docRef.id;
                showToast("Nová lekce byla úspěšně vytvořena.");
            }
            // Aktualizujeme interný stav komponentu
            // Musíme si ponechať existujúce polia ako text_content atď., ak existujú
            this._currentLessonData = { ...(this._currentLessonData || {}), ...lessonData, id: lessonIdToUpdate };

            // Vypálime udalosť, že lekcia bola uložená (pre Timeline)
            const event = new CustomEvent('lesson-saved', { 
                detail: { lesson: JSON.parse(JSON.stringify(this._currentLessonData)) }, // Pošleme kópiu
                bubbles: true, 
                composed: true 
            });
            this.dispatchEvent(event);

        } catch (error) {
            console.error("Error saving lesson details:", error);
            showToast("Při ukládání detailů lekce došlo k chybě.", true);
        } finally {
            this._isSaving = false;
        }
    }

    async _handleEmbedVideo() {
        const urlInput = this.querySelector('#youtube-url');
        const url = urlInput ? urlInput.value.trim() : '';
        
        // Overíme URL len pre UI, ukladáme aj nevalidné (alebo prázdne na zmazanie)
        const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?#]+)/);
        const isValidForPreview = videoIdMatch && videoIdMatch[1];
        
        // Ak je URL prázdny string, voláme delete, inak save
        if (url === '') {
            // Ak už je videoUrl prázdne, nerobíme nič
            if (this._currentLessonData?.videoUrl) {
                await this._handleDeleteGeneratedContent('videoUrl', 'video');
            }
        } else {
            await this._handleSaveGeneratedContent('videoUrl', url);
            if (!isValidForPreview) {
                 showToast("URL adresa nemusí být platná pro YouTube video.", true); // Upozornenie, ale uložíme
            }
        }
        // Komponent sa prekreslí, lebo _handleSave/_handleDelete aktualizuje _currentLessonData
    }

    // Volanie AI na generovanie obsahu
    async _handleGeneration(viewId) {
        const promptInput = this.querySelector('#prompt-input');
        // Prezentácia nemusí mať prompt, použijeme fallback
        const userPrompt = promptInput ? promptInput.value.trim() : (viewId === 'presentation' ? `Klíčové momenty pro lekci ${this._currentLessonData?.title || 'této lekce'}` : ''); 

        if (!userPrompt && viewId !== 'presentation') {
            showToast("Prosím, zadejte text do promptu.", true);
            return;
        }

        this._isGenerating = true;
        this._lastGeneratedData = null; // Reset

        try {
            const selectedFiles = getSelectedFiles(); 
            const filePaths = selectedFiles.map(f => f.fullPath);
            console.log("Using files for RAG:", filePaths); 

            const promptData = { userPrompt };
            // Získame špecifické parametre pre daný typ generovania
            switch (viewId) {
                case 'presentation':
                    promptData.slideCount = this.querySelector('#slide-count-input')?.value || 5;
                    // userPrompt je už nastavený vyššie
                    break;
                case 'test':
                    promptData.questionCount = this.querySelector('#question-count-input')?.value || 5;
                    promptData.difficulty = this.querySelector('#difficulty-select')?.value || 'Střední';
                    promptData.questionTypes = this.querySelector('#type-select')?.value || 'Multiple Choice';
                    break;
                case 'post': // Podcast
                    promptData.episodeCount = this.querySelector('#episode-count-input')?.value || 3;
                    break;
            }

            const generateContent = getGenerateContentCallable(); 
            const result = await generateContent({
                contentType: viewId,
                promptData,
                filePaths, 
            });
            
            if (!result || !result.data) throw new Error("AI nevrátila žádná data.");
            if (result.data.error) throw new Error(result.data.error);
            
            // Uložíme vygenerované dáta do stavu
            // Pre text ukladáme priamo string, pre ostatné celý objekt
            this._lastGeneratedData = (viewId === 'text' && result.data.text) ? result.data.text : result.data; 

        } catch (e) {
            console.error("Error during AI generation:", e);
            showToast(`Došlo k chybě: ${e.message || e}`, true);
            this._lastGeneratedData = { error: `Došlo k chybě: ${e.message || e}` }; // Uložíme chybu pre zobrazenie
        } finally {
            this._isGenerating = false;
        }
    }

    // Uloženie vygenerovaného obsahu do DB
    async _handleSaveGeneratedContent(fieldToUpdate, contentToSave) {
        if (!this._currentLessonData || !this._currentLessonData.id) {
            showToast("Nejprve uložte detaily lekce.", true);
            return;
        }
        if (!contentToSave) {
            showToast("Není co uložit.", true);
            return;
        }

        this._isSaving = true;
        try {
            let dataToSave;
            // Špeciálne formátovanie pre prezentáciu - pridanie styleId
            if (fieldToUpdate === 'presentation') {
                const styleSelector = this.querySelector('#presentation-style-selector');
                const selectedStyleId = styleSelector ? styleSelector.value : 'default';
                if (typeof contentToSave === 'object' && Array.isArray(contentToSave.slides)) {
                     dataToSave = { 
                         styleId: selectedStyleId, 
                         slides: contentToSave.slides 
                     };
                } else {
                     // Ak contentToSave už obsahuje styleId (napr. pri ukladaní existujúceho obsahu), použijeme ho
                     if (typeof contentToSave === 'object' && contentToSave.styleId && Array.isArray(contentToSave.slides)){
                         dataToSave = contentToSave;
                     } else {
                         throw new Error("Neplatná struktura dat prezentace pro uložení.");
                     }
                }
            } 
            // Pre text berieme len pole 'text' z odpovede AI, alebo priamo string
            else if (fieldToUpdate === 'text_content') {
                 dataToSave = (typeof contentToSave === 'object' && contentToSave.text) ? contentToSave.text : contentToSave;
                 if (typeof dataToSave !== 'string') throw new Error("Neplatná struktura dat textu pro uložení.");
            } 
            // Pre video URL berieme string
            else if (fieldToUpdate === 'videoUrl') {
                dataToSave = (typeof contentToSave === 'string') ? contentToSave.trim() : null;
            }
            // Ostatné typy ukladáme tak, ako prišli
            else {
                 dataToSave = contentToSave;
            }

            const lessonRef = doc(firebaseInit.db, 'lessons', this._currentLessonData.id);
            const updateData = { updatedAt: serverTimestamp() };
            updateData[fieldToUpdate] = dataToSave;
            
            await updateDoc(lessonRef, updateData);

            // Aktualizujeme interný stav a vypálime udalosť
            this._currentLessonData[fieldToUpdate] = dataToSave;
            this._currentLessonData.updatedAt = new Date(); // Približný čas pre UI
            this._lastGeneratedData = null; // Resetujeme generované dáta, lebo sú už uložené
            
            const event = new CustomEvent('lesson-saved', { 
                 detail: { lesson: JSON.parse(JSON.stringify(this._currentLessonData)) }, // Pošleme kópiu
                 bubbles: true, 
                 composed: true 
            });
            this.dispatchEvent(event);
            
            showToast("Obsah byl úspěšně uložen do lekce.");
            // Komponent sa automaticky prekreslí a zobrazí uložený obsah namiesto generátora

        } catch (error) {
            console.error(`Chyba při ukládání obsahu (${fieldToUpdate}):`, error);
            showToast("Při ukládání obsahu došlo k chybě.", true);
        } finally {
            this._isSaving = false;
        }
    }

    // Mazanie existujúceho obsahu sekcie
    async _handleDeleteGeneratedContent(fieldToDelete, viewId) {
        if (!this._currentLessonData || !this._currentLessonData.id) {
            showToast("Lekce není uložena.", true);
            return;
        }
        if (!confirm(`Opravdu si přejete smazat ${viewId === 'video' ? 'odkaz na video' : 'tento obsah'} a aktivovat generátor/editor?`)) {
            return;
        }

        this._isDeleting = true;
        try {
            const lessonRef = doc(firebaseInit.db, 'lessons', this._currentLessonData.id);
            await updateDoc(lessonRef, {
                [fieldToDelete]: deleteField(),
                updatedAt: serverTimestamp() 
            });
            
            // Aktualizujeme interný stav a vypálime udalosť
            delete this._currentLessonData[fieldToDelete];
            this._currentLessonData.updatedAt = new Date(); 
            
            const event = new CustomEvent('lesson-saved', { 
                 detail: { lesson: JSON.parse(JSON.stringify(this._currentLessonData)) }, // Pošleme kópiu
                 bubbles: true, 
                 composed: true 
            });
            this.dispatchEvent(event);

            showToast("Obsah byl úspěšně smazán.");
            // Komponent sa automaticky prekreslí, lebo `_currentLessonData` sa zmenilo

        } catch (error) {
            console.error("Chyba při mazání obsahu:", error);
            showToast("Při mazání obsahu došlo k chybě.", true);
        } finally {
            this._isDeleting = false;
        }
    }
    
    // Stiahnutie obsahu lekcie (logika z editor-handler.js)
    _handleDownloadLessonContent() {
        if (!this._currentLessonData) return showToast("Lekce není načtena.", true);
    
        let contentString = "";
        const lesson = this._currentLessonData;
        const title = lesson.title || "Nova_lekce";
    
        contentString += `# ${lesson.title || "Nová lekce"}\n`;
        if (lesson.subtitle) contentString += `## ${lesson.subtitle}\n`;
        contentString += `\n---\n\n`;
    
        if (lesson.text_content) contentString += `### Text pro studenty\n\n${lesson.text_content}\n\n---\n\n`;
        if (lesson.presentation?.slides) contentString += `### Prezentace (Styl: ${lesson.presentation.styleId || 'default'})\n\n${lesson.presentation.slides.map((s, i) => `**Slide ${i + 1}: ${s.title}**\n${(s.points || []).map(p => `- ${p}`).join('\n')}\n`).join('\n')}\n---\n\n`;
        if (lesson.videoUrl) contentString += `### Video\n\n${lesson.videoUrl}\n\n---\n\n`;
        if (lesson.quiz?.questions) contentString += `### Kvíz\n\n${lesson.quiz.questions.map((q, i) => `${i + 1}. ${q.question_text}\n${(q.options || []).map((o, j) => `  - ${o}${j === q.correct_option_index ? " (Správně)" : ""}`).join('\n')}`).join('\n\n')}\n\n---\n\n`;
        if (lesson.test?.questions) contentString += `### Test\n\n${lesson.test.questions.map((q, i) => `${i + 1}. ${q.question_text}\n${(q.options || []).map((o, j) => `  - ${o}${j === q.correct_option_index ? " (Správně)" : ""}`).join('\n')}`).join('\n\n')}\n\n---\n\n`;
        if (lesson.podcast_script?.episodes) contentString += `### Podcast Skript\n\n${lesson.podcast_script.episodes.map((ep, i) => `**Epizoda ${i + 1}: ${ep.title}**\n\n${ep.script}\n\n`).join('')}---\n\n`;
    
        const blob = new Blob([contentString], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Obsah lekce byl stažen.");
    }

}

customElements.define('lesson-editor', LessonEditor);
