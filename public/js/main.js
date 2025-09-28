// --- HLAVNÍ SKRIPT APLIKACE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { initializeUpload } from './upload-handler.js';

document.addEventListener('DOMContentLoaded', async () => {

    // --- Firebase a Functions Inicializace (připraveno pro deploy) ---
    let app;
    try {
        const response = await fetch('/__/firebase/init.json');
        const firebaseConfig = await response.json();
        app = initializeApp(firebaseConfig);
    } catch (e) {
        console.warn("Nepodařilo se načíst automatickou Firebase konfiguraci, používá se lokální fallback.");
        const firebaseConfig = {
            apiKey: "AIzaSyB3mUbw9cC8U6UzUNvPadrwdhjXFcu3aeA",
            authDomain: "ai-sensei-czu-pilot.firebaseapp.com",
            projectId: "ai-sensei-czu-pilot",
            storageBucket: "ai-sensei-czu-pilot.appspot.com",
            messagingSenderId: "413145704611",
            appId: "1:413145704611:web:75f8e571995276f99af716",
            measurementId: "G-4QDC0F2Q6Q"
        };
        app = initializeApp(firebaseConfig);
    }

    const functions = getFunctions(app);
    const db = getFirestore(app);
    const storage = getStorage(app);

    const generateTextFunction = httpsCallable(functions, 'generateText');
    const generateJsonFunction = httpsCallable(functions, 'generateJson');

    // --- API Volání ---
    async function callGeminiApi(prompt, systemInstruction = null) {
        console.log("Volám Firebase funkci 'generateText':", { prompt, systemInstruction });
        try {
            const result = await generateTextFunction({ prompt, systemInstruction });
            return result.data;
        } catch (error) {
            console.error("Chyba při volání Firebase funkce 'generateText':", error);
            return { error: `Chyba backendu: ${error.message}` };
        }
    }

    async function callGeminiForJson(prompt, schema) {
        console.log("Volám Firebase funkci 'generateJson':", { prompt, schema });
        try {
            const result = await generateJsonFunction({ prompt, schema });
            return result.data;
        } catch (error) {
            console.error("Chyba při volání Firebase funkce 'generateJson':", error);
            return { error: `Chyba backendu při generování JSON: ${error.message}` };
        }
    }

    // <-- ZDE JE PŘIDANÁ ÚPRAVA -->
    // Zpřístupnění funkcí pro ostatní skripty (např. editor-handler.js)
    window.callGeminiApi = callGeminiApi;
    window.callGeminiForJson = callGeminiForJson;
    // <-- KONEC ÚPRAVY -->

    // --- DATA A STAV APLIKACE ---
    let lessonsData = [
        { id: "1", title: 'Úvod do Kvantové Fyziky', subtitle: 'Základní principy', number: '101', creationDate: '2025-09-20', status: 'Aktivní', icon: '⚛️', content: 'Vítejte ve fascinujícím světě kvantové mechaniky! Na rozdíl od klasické fyziky, která popisuje pohyb velkých objektů jako jsou planety nebo míče, kvantová mechanika se zabývá chováním hmoty a energie na atomární a subatomární úrovni. Jedním z klíčových a nejvíce matoucích principů je vlnově-korpuskulární dualismus, který říká, že částice jako elektrony se mohou chovat jednou jako částice a jindy jako vlny. Dalším stěžejním konceptem je princip superpozice. Představte si minci, která se točí ve vzduchu. Dokud nedopadne, není ani panna, ani orel - je v jakémsi stavu obou možností najednou. Podobně může být kvantová částice ve více stavech současně, dokud ji nezačneme měřit. Teprve měřením "donutíme" částici vybrat si jeden konkrétní stav.' },
        { id: "2", title: 'Historie Starověkého Říma', subtitle: 'Od republiky k císařství', number: '203', creationDate: '2025-09-18', status: 'Aktivní', icon: '🏛️', content: 'Dějiny starověkého Říma jsou příběhem o vzestupu malé městské osady na Apeninském poloostrově v globální impérium. Počátky se datují do 8. století př. n. l. a končí pádem Západořímské říše v roce 476 n. l. Římská republika, založená kolem roku 509 př. n. l., byla charakteristická systémem volených magistrátů a silným senátem.' },
        { id: "3", title: 'Základy botaniky', subtitle: 'Fotosyntéza a růst', number: 'B05', creationDate: '2025-09-15', status: 'Naplánováno', icon: '🌱', content: 'Botanika je věda o rostlinách. Klíčovým procesem pro život na Zemi je fotosyntéza, při které zelené rostliny využívají sluneční světlo, vodu a oxid uhličitý k výrobě glukózy (energie) a kyslíku. Tento proces probíhá v chloroplastech, které obsahují zelené barvivo chlorofyl.' },
        { id: "4", title: 'Shakespearova dramata', subtitle: 'Tragédie a komedie', number: 'LIT3', creationDate: '2025-09-12', status: 'Archivováno', icon: '🎭', content: 'William Shakespeare je považován za jednoho z největších dramatiků všech dob. Jeho hry se dělí na tragédie (Hamlet, Romeo a Julie), komedie (Sen noci svatojánské) a historické hry. Jeho dílo je charakteristické komplexními postavami, poetickým jazykem a nadčasovými tématy lásky, zrady, moci a smrti.'},
        { id: "5", title: 'Neuronové sítě', subtitle: 'Úvod do hlubokého učení', number: 'AI-5', creationDate: '2025-09-21', status: 'Naplánováno', icon: '🧠', content: 'Neuronové sítě jsou základním stavebním kamenem moderní umělé inteligence a hlubokého učení. Jsou inspirovány strukturou lidského mozku a skládají se z propojených uzlů neboli "neuronů", které zpracovávají a přenášejí informace. Učí se na základě velkých objemů dat tím, že upravují váhy spojení mezi neurony.' },
    ];
    let timelineData = JSON.parse(localStorage.getItem('ai-sensei-timeline-v8')) || {
        "3": [1],
        "5": [5]
    };
    
    let currentUserRole = null;
    let currentLesson = null;
    const appContainer = document.getElementById('app-container');
    
    // --- HLAVNÍ LOGIKA APLIKACE ---
    function init() { renderLogin(); }

    function renderLogin() {
        appContainer.innerHTML = document.getElementById('login-template').innerHTML;
        document.getElementById('ai-assistant-btn').style.display = 'none';
        document.getElementById('login-professor').addEventListener('click', () => login('professor'));
        document.getElementById('login-student').addEventListener('click', () => login('student'));
    }

    function login(role) {
        currentUserRole = role;
        appContainer.innerHTML = document.getElementById('main-app-template').innerHTML;
        document.getElementById('ai-assistant-btn').style.display = 'flex';

        if (role === 'professor') {
            setupProfessorNav();
            const professorHTML = `<div id="dashboard-professor" class="w-full flex main-view active"><aside id="professor-sidebar" class="w-full md:w-96 bg-white border-r border-slate-200 flex flex-col flex-shrink-0"></aside><main id="main-content-area" class="flex-grow bg-slate-100 flex flex-col h-screen"></main></div>`;
            document.getElementById('role-content-wrapper').innerHTML = professorHTML;
            showProfessorContent('timeline');
        } else {
            setupStudentNav();
            const studentHTML = `<div id="dashboard-student" class="w-full flex main-view active"><aside class="w-72 bg-white border-r border-slate-200 flex-col p-4 flex-shrink-0 hidden md:flex"></aside><main id="student-content-area" class="flex-grow p-4 sm:p-6 md:p-8 overflow-y-auto bg-slate-50"></main></div>`;
            document.getElementById('role-content-wrapper').innerHTML = studentHTML;
            initStudentDashboard();
        }
        document.getElementById('logout-btn').addEventListener('click', logout);
        document.getElementById('ai-assistant-btn').addEventListener('click', showAiAssistant);
    }

    function logout() {
        currentUserRole = null;
        currentLesson = null;
        renderLogin();
    }
    
    // --- LOGIKA PRO DASHBOARD PROFESORA ---
    function setupProfessorNav() {
        const nav = document.getElementById('main-nav');
        nav.innerHTML = `
            <li><button data-view="timeline" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white transition-colors" title="Plán výuky"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button></li>
            <li><button id="media-library-btn" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white transition-colors" title="Knihovna médií"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button></li>
            <li><button data-view="interactions" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white transition-colors" title="Interakce se studenty"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button></li>
            <li><button data-view="analytics" class="nav-item p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white transition-colors" title="Analýza studentů"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 2v6l6.1 2.4-4.2 6L2.5 22"/><path d="M21.5 2v6l-6.1 2.4 4.2 6L21.5 22"/><path d="M12 2v20"/></svg></button></li>
        `;
        nav.querySelector('[data-view="timeline"]').addEventListener('click', () => showProfessorContent('timeline'));
        nav.querySelector('#media-library-btn').addEventListener('click', showMediaLibrary);
        nav.querySelector('[data-view="interactions"]').addEventListener('click', () => showProfessorContent('interactions'));
        nav.querySelector('[data-view="analytics"]').addEventListener('click', () => showProfessorContent('analytics'));
    }

    function showProfessorContent(view, lesson = null) {
        const sidebar = document.getElementById('professor-sidebar');
        const mainArea = document.getElementById('main-content-area');
        mainArea.innerHTML = '';
        sidebar.innerHTML = '';
        mainArea.className = 'flex-grow bg-slate-100 flex flex-col h-screen view-transition';

        if (view === 'timeline') {
            renderLessonLibrary(sidebar);
            renderTimeline(mainArea);
        } else if (view === 'editor') {
            currentLesson = lesson;
            renderEditorMenu(sidebar);
            showEditorContent(lesson ? 'docs' : 'details');
        } else if (view === 'interactions') {
            renderStudentInteractions(mainArea);
            sidebar.innerHTML = `<div class="p-4"><h2 class="text-xl font-bold">Interakce</h2><p class="text-sm text-slate-500 mt-2">Zde spravujete komunikaci se svými studenty.</p></div>`;
        } else if (view === 'analytics') {
            renderAnalytics(mainArea);
            sidebar.innerHTML = `<div class="p-4"><h2 class="text-xl font-bold">Analýza Studentů</h2><p class="text-sm text-slate-500 mt-2">AI přehledy o pokroku a zapojení studentů.</p></div>`;
        }
    }

    function renderLessonLibrary(container) {
        container.innerHTML = `
            <header class="p-4 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
                <h2 class="text-xl font-bold text-slate-800">Knihovna lekcí</h2>
                <button id="create-new-lesson-btn" class="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800 transition transform hover:scale-105">+ Nová lekce</button>
            </header>
            <div class="flex-grow overflow-y-auto p-2">
                <div id="lesson-library-list"></div>
            </div>`;

        const listEl = container.querySelector('#lesson-library-list');
        const statuses = ['Aktivní', 'Naplánováno', 'Archivováno'];
        listEl.innerHTML = statuses.map(status => `
            <div class="p-2">
                <h3 class="px-2 text-sm font-semibold text-slate-500 mb-2">${status}</h3>
                ${lessonsData.filter(l => l.status === status).map(lesson => `
                    <div class="lesson-bubble-in-library p-3 mb-2 rounded-lg flex items-center space-x-3 cursor-pointer bg-white border border-slate-200 hover:shadow-md hover:border-green-500 transition-all" data-id="${lesson.id}" draggable="true">
                        <span class="text-2xl">${lesson.icon}</span>
                        <div>
                            <span class="font-semibold text-sm text-slate-700">${lesson.title}</span>
                            <p class="text-xs text-slate-500">${lesson.subtitle}</p>
                        </div>
                    </div>
                `).join('') || `<p class="px-2 text-xs text-slate-400">Žádné lekce.</p>`}
            </div>
        `).join('');
        
        container.querySelector('#create-new-lesson-btn').addEventListener('click', () => showProfessorContent('editor', null));
        container.querySelectorAll('.lesson-bubble-in-library').forEach(el => {
            el.addEventListener('click', () => {
                const lesson = lessonsData.find(l => l.id == el.dataset.id);
                showProfessorContent('editor', lesson);
            });
            el.addEventListener('dragstart', (e) => {
                e.target.classList.add('dragging');
                e.dataTransfer.setData('lesson_id', e.target.dataset.id);
            });
            el.addEventListener('dragend', (e) => e.target.classList.remove('dragging'));
        });
    }
    
    function renderTimeline(container) {
        container.innerHTML = `
            <header class="text-center p-6 border-b border-slate-200 bg-white">
                <h1 class="text-3xl font-extrabold text-slate-800">Plán výuky</h1>
                <p class="text-slate-500 mt-1">Naplánujte lekce přetažením z knihovny vlevo.</p>
            </header>
            <div class="flex-grow overflow-y-auto p-4 md:p-6">
                <div class="bg-gradient-to-r from-green-600 to-green-800 text-white p-4 rounded-xl mb-6 shadow-lg">
                    <h3 class="font-bold">💡 Tip od AI Sensei</h3>
                    <p class="text-sm mt-1">Zvažte přidání krátkého opakovacího kvízu na začátek lekce 'Neuronové sítě' pro lepší zapojení studentů.</p>
                </div>
                <div id="timeline-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"></div>
            </div>`;
        
        const timelineContainer = container.querySelector('#timeline-container');
        const startDate = new Date('2025-09-23T12:00:00Z');
        
        for (let i = 0; i < 10; i++) {
            const dayDate = new Date(startDate);
            dayDate.setDate(startDate.getDate() + i);
            const dayWrapper = document.createElement('div');
            dayWrapper.className = 'day-slot bg-white rounded-xl p-3 border-2 border-transparent transition-colors min-h-[250px] shadow-sm flex flex-col';
            dayWrapper.dataset.day = i + 1;
            
            const formattedDate = dayDate.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' });
            dayWrapper.innerHTML = `<div class="text-center pb-2 mb-2 border-b border-slate-200"><p class="font-bold text-slate-700">${formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1)}</p></div><div class="lessons-container flex-grow"></div>`;
            
            const lessonsCont = dayWrapper.querySelector('.lessons-container');
            if (timelineData[i + 1]) {
                timelineData[i + 1].forEach(lessonId => {
                    const lesson = lessonsData.find(l => l.id == lessonId);
                    if (lesson) lessonsCont.appendChild(createTimelineLessonElement(lesson));
                });
            }
            timelineContainer.appendChild(dayWrapper);
        }
        addTimelineDragDropListeners();
    }

    function createTimelineLessonElement(lesson) {
        const el = document.createElement('div');
        el.className = 'lesson-bubble bg-green-100 text-green-800 p-3 m-1 rounded-lg shadow-sm flex items-center space-x-3 border border-green-200';
        el.dataset.id = lesson.id;
        el.draggable = true;
        el.innerHTML = `<span class="text-xl">${lesson.icon}</span><span class="font-semibold text-sm">${lesson.title}</span>`;
        
        el.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            e.target.classList.add('dragging');
            e.dataTransfer.setData('lesson_id', e.target.dataset.id);
            e.dataTransfer.setData('original_day', e.target.closest('.day-slot').dataset.day);
        });
        el.addEventListener('dragend', (e) => e.target.classList.remove('dragging'));
        return el;
    }
    
    function addTimelineDragDropListeners() {
        document.querySelectorAll('.day-slot').forEach(zone => {
            zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
            zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
            zone.addEventListener('drop', e => {
                e.preventDefault();
                zone.classList.remove('drag-over');
                const lessonId = e.dataTransfer.getData('lesson_id');
                const newDay = zone.dataset.day;
                const originalDay = e.dataTransfer.getData('original_day') ? e.dataTransfer.getData('original_day') : null;

                if (originalDay && timelineData[originalDay]) {
                    timelineData[originalDay] = timelineData[originalDay].filter(id => id !== lessonId);
                }
                if (!timelineData[newDay]) timelineData[newDay] = [];
                if (!timelineData[newDay].includes(lessonId)) {
                    timelineData[newDay].push(lessonId);
                }
                
                localStorage.setItem('ai-sensei-timeline-v8', JSON.stringify(timelineData));
                renderTimeline(document.getElementById('main-content-area'));
            });
        });
    }

    function renderEditorMenu(container) {
        container.innerHTML = `
            <header class="p-4 border-b border-slate-200 flex-shrink-0">
                <button id="back-to-timeline-btn" class="flex items-center text-sm text-green-700 hover:underline mb-3">&larr; Zpět na plán výuky</button>
                <div class="flex items-center space-x-3">
                    <span class="text-3xl">${currentLesson ? currentLesson.icon : '🆕'}</span>
                    <h2 id="editor-lesson-title" class="text-xl font-bold truncate text-slate-800">${currentLesson ? currentLesson.title : 'Vytvořit novou lekci'}</h2>
                </div>
            </header>
            <div class="flex-grow overflow-y-auto p-2"><nav id="editor-vertical-menu" class="flex flex-col space-y-1"></nav></div>`;

        container.querySelector('#back-to-timeline-btn').addEventListener('click', () => showProfessorContent('timeline'));
        
        const menuEl = container.querySelector('#editor-vertical-menu');
        const menuItems = [
            { id: 'details', label: 'Detaily lekce', icon: '📝' },
            { id: 'docs', label: 'Dokumenty k lekci', icon: '📁' }, { id: 'text', label: 'Text pro studenty', icon: '✍️' },
            { id: 'presentation', label: 'Prezentace', icon: '🖼️' }, { id: 'video', label: 'Video', icon: '▶️' },
            { id: 'quiz', label: 'Kvíz', icon: '❓' }, { id: 'test', label: 'Test', icon: '✅' }, { id: 'post', label: 'Podcast & Materiály', icon: '🎙️' },
        ];
        
        menuEl.innerHTML = menuItems.map(item => `<a href="#" data-view="${item.id}" class="editor-menu-item flex items-center p-3 text-sm font-medium rounded-md hover:bg-slate-100 transition-colors">${item.icon}<span class="ml-3">${item.label}</span></a>`).join('');
        
        menuEl.querySelectorAll('.editor-menu-item').forEach(item => {
            item.addEventListener('click', e => { 
                e.preventDefault(); 
                menuEl.querySelectorAll('.editor-menu-item').forEach(i => i.classList.remove('bg-green-100', 'text-green-800', 'font-semibold'));
                item.classList.add('bg-green-100', 'text-green-800', 'font-semibold');
                showEditorContent(item.dataset.view); 
            });
        });
        menuEl.querySelector('.editor-menu-item').click();
    }
    
    async function showEditorContent(viewId) {
        const mainArea = document.getElementById('main-content-area');
        mainArea.innerHTML = `<div class="p-4 sm:p-6 md:p-8 overflow-y-auto h-full view-transition" id="editor-content-container"></div>`;
        const container = document.getElementById('editor-content-container');
        let contentHTML = '';
        
        const renderWrapper = (title, content) => `<h2 class="text-3xl font-extrabold text-slate-800 mb-6">${title}</h2><div class="bg-white p-6 rounded-2xl shadow-lg">${content}</div>`;
        
        switch(viewId) {
            case 'details':
                contentHTML = renderWrapper('Detaily lekce', `
                    <div id="lesson-details-form" class="space-y-4">
                        <div><label class="block font-medium text-slate-600">Název lekce</label><input type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1 focus:ring-green-500 focus:border-green-500" value="${currentLesson?.title || ''}" placeholder="Např. Úvod do organické chemie"></div>
                        <div><label class="block font-medium text-slate-600">Podtitulek</label><input type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="${currentLesson?.subtitle || ''}" placeholder="Základní pojmy a principy"></div>
                         <div class="grid grid-cols-2 gap-4">
                            <div><label class="block font-medium text-slate-600">Číslo lekce</label><input type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="${currentLesson?.number || ''}" placeholder="Např. 101"></div>
                            <div><label class="block font-medium text-slate-600">Datum vytvoření</label><input type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1 bg-slate-100" value="${currentLesson ? new Date(currentLesson.creationDate).toLocaleDateString('cs-CZ') : new Date().toLocaleDateString('cs-CZ')}" disabled></div>
                        </div>
                        <div class="text-right pt-4"><button class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105">Uložit změny</button></div>
                    </div>`);
                break;
            case 'docs':
                contentHTML = renderWrapper('Dokumenty k lekci', `
                    <p class="text-slate-500 mb-4">Nahrajte specifické soubory pro tuto lekci (např. sylabus, doplňkové texty).</p>
                    <div id="upload-zone" class="upload-zone rounded-lg p-10 text-center text-slate-500 cursor-pointer"><p class="font-semibold">Přetáhněte soubory sem nebo klikněte pro výběr</p><p class="text-sm">Maximální velikost 10MB</p></div>
                    <input type="file" id="file-upload-input" multiple class="hidden">
                    <div id="upload-progress" class="mt-4 space-y-2"></div>
                    <h3 class="font-bold text-slate-700 mt-6 mb-2">Nahrané soubory:</h3>
                    <ul id="documents-list" class="space-y-2"><li>Načítám...</li></ul>`);
                
                setTimeout(() => {
                    if (typeof initializeUpload === 'function') {
                        initializeUpload(currentLesson, db, storage); 
                    }
                }, 0);
                break;
            case 'text':
                contentHTML = renderWrapper('Text pro studenty', `
                    <p class="text-slate-500 mb-4">Zadejte AI prompt a vygenerujte hlavní studijní text pro tuto lekci.</p>
                    <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder="Např. 'Vytvoř poutavý úvodní text o principech kvantové mechaniky pro úplné začátečníky. Zmiň Schrödingera, Heisenberga a princip superpozice.'"></textarea>
                    <div class="flex items-center justify-between mt-4">
                        <div class="flex items-center space-x-4">
                            <label class="font-medium">Délka:</label>
                            <select id="length-select" class="rounded-lg border-slate-300"><option>Krátký</option><option selected>Střední</option><option>Dlouhý</option></select>
                        </div>
                        <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ai-glow">✨<span class="ml-2">Generovat text</span></button>
                    </div>
                    <div id="generation-output" class="mt-6 border-t pt-6 text-slate-700 prose max-w-none">
                        <div class="text-center p-8 text-slate-400">Obsah se vygeneruje zde...</div>
                    </div>`);
                break;
            case 'presentation':
                 contentHTML = renderWrapper('AI Prezentace', `
                    <p class="text-slate-500 mb-4">Zadejte téma a počet slidů pro vygenerování prezentace.</p>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="md:col-span-2"><label class="block font-medium text-slate-600">Téma prezentace</label><input id="prompt-input" type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1" placeholder="Např. Klíčové momenty Římské republiky"></div>
                        <div><label class="block font-medium text-slate-600">Počet slidů</label><input id="slide-count-input" type="number" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="3"></div>
                    </div>
                    <div class="text-right mt-4">
                         <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ml-auto ai-glow">✨<span class="ml-2">Generovat prezentaci</span></button>
                    </div>
                    <div id="generation-output" class="mt-6 border-t pt-6">
                        <div class="text-center p-8 text-slate-400">Náhled prezentace se zobrazí zde...</div>
                    </div>`);
                break;
            case 'video':
                contentHTML = renderWrapper('Vložení videa', `
                    <p class="text-slate-500 mb-4">Vložte odkaz na video z YouTube, které se zobrazí studentům v jejich panelu.</p>
                    <div><label class="block font-medium text-slate-600">YouTube URL</label><input id="youtube-url" type="text" class="w-full border-slate-300 rounded-lg p-2 mt-1" placeholder="https://www.youtube.com/watch?v=i-z_I1_Z2lY"></div>
                    <div class="text-right pt-4"><button id="embed-video-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800">Vložit video</button></div>
                    <div id="video-preview" class="mt-6 border-t pt-6">
                        <div class="text-center p-8 text-slate-400">Náhled videa se zobrazí zde...</div>
                    </div>`);
                break;
            case 'quiz':
                contentHTML = renderWrapper('Interaktivní Kvíz', `
                    <p class="text-slate-500 mb-4">Vytvořte rychlý kvíz pro studenty. Otázky se objeví v jejich chatovacím rozhraní.</p>
                    <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder="Např. 'Vytvoř 1 otázku s výběrem ze 3 možností na téma kvantová mechanika. Označ správnou odpověď.'"></textarea>
                    <div class="text-right mt-4">
                         <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ml-auto ai-glow">✨<span class="ml-2">Vygenerovat kvíz</span></button>
                    </div>
                    <div id="generation-output" class="mt-6 border-t pt-6">
                        <div class="text-center p-8 text-slate-400">Náhled kvízu se zobrazí zde...</div>
                    </div>`);
                break;
            case 'test':
                 contentHTML = renderWrapper('Pokročilý Test', `
                    <p class="text-slate-500 mb-4">Navrhněte komplexnější test pro studenty s různými typy otázek a nastavením obtížnosti.</p>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div><label class="block font-medium text-slate-600">Počet otázek</label><input id="question-count-input" type="number" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="2"></div>
                        <div>
                            <label class="block font-medium text-slate-600">Obtížnost</label>
                            <select id="difficulty-select" class="w-full border-slate-300 rounded-lg p-2 mt-1"><option>Lehká</option><option selected>Střední</option><option>Těžká</option></select>
                        </div>
                        <div>
                            <label class="block font-medium text-slate-600">Typy otázek</label>
                            <select id="type-select" class="w-full border-slate-300 rounded-lg p-2 mt-1"><option>Mix (výběr + pravda/nepravda)</option><option>Výběr z možností</option><option>Pravda/Nepravda</option></select>
                        </div>
                    </div>
                    <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder="Zadejte hlavní téma testu, např. 'Klíčové události a postavy Římské republiky od jejího založení po vznik císařství.'"></textarea>
                    <div class="text-right mt-4">
                         <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ml-auto ai-glow">✨<span class="ml-2">Vygenerovat test</span></button>
                    </div>
                    <div id="generation-output" class="mt-6 border-t pt-6">
                        <div class="text-center p-8 text-slate-400">Náhled testu se zobrazí zde...</div>
                    </div>`);
                break;
            case 'post':
                contentHTML = renderWrapper('Podcast & Doplňkové materiály', `
                    <p class="text-slate-500 mb-4">Vytvořte na základě obsahu lekce sérii podcastů nebo jiné doplňkové materiály, které studentům pomohou prohloubit znalosti.</p>
                    <div class="bg-slate-50 p-4 rounded-lg">
                        <h4 class="font-bold text-slate-800 mb-3">🎙️ Generátor Podcastové Série</h4>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div>
                                <label class="block font-medium text-slate-600 text-sm">Počet epizod</label>
                                <input id="episode-count-input" type="number" class="w-full border-slate-300 rounded-lg p-2 mt-1" value="3">
                            </div>
                            <div>
                                <label class="block font-medium text-slate-600 text-sm">Hlas</label>
                                <select id="voice-select" class="w-full border-slate-300 rounded-lg p-2 mt-1"><option>Mužský (informativní)</option><option>Ženský (konverzační)</option></select>
                            </div>
                            <div>
                                <label class="block font-medium text-slate-600 text-sm">Jazyk</label>
                                <select class="w-full border-slate-300 rounded-lg p-2 mt-1"><option>Čeština</option><option>Angličtina</option></select>
                            </div>
                        </div>
                        <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-20" placeholder="Zadejte hlavní téma pro sérii podcastů. Standardně vychází z tématu lekce. Např. 'Vytvoř sérii podcastů, které detailněji prozkoumají klíčové koncepty kvantové fyziky zmíněné v lekci.'">${'Prozkoumej klíčové koncepty z lekce "' + (currentLesson?.title || 'aktuální lekce') + '"'}</textarea>
                        <div class="text-right mt-4">
                            <button id="generate-btn" data-type="podcast" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition transform hover:scale-105 flex items-center ml-auto ai-glow">✨<span class="ml-2">Vytvořit sérii podcastů</span></button>
                        </div>
                    </div>
                     <div id="generation-output" class="mt-6 border-t pt-6">
                        <div class="text-center p-8 text-slate-400">Vygenerovaný obsah se zobrazí zde...</div>
                    </div>
                `);
                break;
            default:
                contentHTML = renderWrapper(viewId, `<div class="text-center p-8 text-slate-400">Tato sekce se připravuje.</div>`);
        }
        container.innerHTML = contentHTML;
        
        if (viewId === 'video') {
            document.getElementById('embed-video-btn').addEventListener('click', () => {
                const urlInput = document.getElementById('youtube-url');
                const url = urlInput.value;
                const videoId = url.split('v=')[1]?.split('&')[0];
                if (videoId) {
                    document.getElementById('video-preview').innerHTML = `<div class="rounded-xl overflow-hidden aspect-video mx-auto max-w-2xl shadow-lg"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen class="w-full h-full"></iframe></div>`;
                } else {
                    document.getElementById('video-preview').innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg text-center">Neplatná YouTube URL.</div>`;
                }
            });
        }

        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', async () => {
                const outputEl = document.getElementById('generation-output');
                const promptInput = document.getElementById('prompt-input');
                let prompt = promptInput ? promptInput.value.trim() : 'general prompt for ' + viewId;

                if (promptInput && !prompt) {
                    outputEl.innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg">Prosím, zadejte text do promptu.</div>`;
                    return;
                }
                
                const originalText = generateBtn.innerHTML;
                generateBtn.innerHTML = `<div class="spinner"></div><span class="ml-2">Generuji...</span>`;
                generateBtn.disabled = true;
                if(promptInput) promptInput.disabled = true;
                outputEl.innerHTML = `<div class="p-8 text-center pulse-loader text-slate-500">🤖 AI Sensei přemýšlí a tvoří obsah...</div>`;

                let result;
                try {
                    switch(viewId) {
                         case 'text':
                            const length = document.getElementById('length-select').value;
                            result = await callGeminiApi(`Vytvoř studijní text na základě tohoto zadání. Požadovaná délka je ${length}. Text by měl být poutavý a edukativní. Zadání: "${prompt}"`);
                            if (result.error) throw new Error(result.error);
                            outputEl.innerHTML = `<div class="prose max-w-none">${result.text.replace(/\n/g, '<br>')}</div>`;
                            break;
                        case 'presentation':
                            const slideCount = document.getElementById('slide-count-input').value;
                            result = await callGeminiForJson(`Vytvoř prezentaci na téma "${prompt}" s přesně ${slideCount} slidy.`, { type: "OBJECT", properties: { slides: { type: "ARRAY", items: { type: "OBJECT", properties: { title: { type: "STRING" }, points: { type: "ARRAY", items: { type: "STRING" } } }, required: ["title", "points"] } } } });
                            if (result.error) throw new Error(result.error);
                            const slidesHtml = result.slides.map((slide, i) => `<div class="p-4 border border-slate-200 rounded-lg mb-4 shadow-sm"><h4 class="font-bold text-green-700">Slide ${i+1}: ${slide.title}</h4><ul class="list-disc list-inside mt-2 text-sm text-slate-600">${slide.points.map(p => `<li>${p}</li>`).join('')}</ul></div>`).join('');
                            outputEl.innerHTML = slidesHtml;
                            break;
                        case 'quiz':
                            result = await callGeminiForJson(`Vytvoř kvíz na základě tohoto zadání: "${prompt}"`, { type: "OBJECT", properties: { questions: { type: "ARRAY", items: { type: "OBJECT", properties: { question_text: { type: "STRING" }, options: { type: "ARRAY", items: { type: "STRING" } }, correct_option_index: { type: "NUMBER" } }, required: ["question_text", "options", "correct_option_index"] } } } });
                            if (result.error) throw new Error(result.error);
                            const questionsHtml = result.questions.map((q, i) => `<div class="p-4 border border-slate-200 rounded-lg mb-4"><p class="font-semibold">${i+1}. ${q.question_text}</p><div class="mt-2 space-y-1 text-sm">${q.options.map((opt, j) => `<div class="${j === q.correct_option_index ? 'text-green-700 font-bold' : ''}">${String.fromCharCode(65 + j)}) ${opt}</div>`).join('')}</div></div>`).join('');
                            outputEl.innerHTML = questionsHtml;
                            break;
                         case 'test':
                            const qCount = document.getElementById('question-count-input').value;
                            const difficulty = document.getElementById('difficulty-select').value;
                            const qType = document.getElementById('type-select').value;
                            result = await callGeminiForJson(`Vytvoř test na téma "${prompt}" s ${qCount} otázkami. Obtížnost testu je ${difficulty}. Typy otázek: ${qType}.`, { type: "OBJECT", properties: { questions: { type: "ARRAY", items: { type: "OBJECT", properties: { question_text: { type: "STRING" }, question_type: { type: "STRING", enum: ["multiple_choice", "true_false"] }, options: { type: "ARRAY", items: { type: "STRING" } }, correct_answer: { type: "STRING" } }, required: ["question_text", "question_type", "options", "correct_answer"] } } } });
                            if (result.error) throw new Error(result.error);
                            const testHtml = result.questions.map((q, i) => `<div class="p-4 border border-slate-200 rounded-lg mb-4"><p class="font-semibold">${i+1}. ${q.question_text}</p><div class="mt-2 space-y-1 text-sm">${q.options.map(opt => `<div>- ${opt}</div>`).join('')}</div><div class="mt-2 text-xs font-bold text-green-700 bg-green-100 p-1 rounded inline-block">Správná odpověď: ${q.correct_answer}</div></div>`).join('');
                            outputEl.innerHTML = testHtml;
                            break;
                        case 'post':
                            const episodeCount = document.getElementById('episode-count-input').value;
                            result = await callGeminiForJson(`Vytvoř sérii podcastů o ${episodeCount} epizodách na základě zadání: "${prompt}". Každá epizoda by měla mít chytlavý název a krátký popis obsahu.`, { type: "OBJECT", properties: { podcast_series: { type: "ARRAY", items: { type: "OBJECT", properties: { episode: { type: "NUMBER" }, title: { type: "STRING" }, summary: { type: "STRING" } }, required: ["episode", "title", "summary"] } } } });
                            if (result.error) throw new Error(result.error);
                            const podcastsHtml = result.podcast_series.map(p => `<div class="p-4 border border-slate-200 rounded-lg mb-4 flex items-start space-x-4"><div class="text-3xl">🎧</div><div><h4 class="font-bold text-green-700">Epizoda ${p.episode}: ${p.title}</h4><p class="text-sm text-slate-600 mt-1">${p.summary}</p></div></div>`).join('');
                            outputEl.innerHTML = `<h3 class="text-xl font-bold mb-4">Vygenerovaná Série Podcastů:</h3>${podcastsHtml}`;
                            break;
                    }
                } catch (e) {
                     outputEl.innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg">Došlo k chybě: ${e.message}</div>`;
                } finally {
                    generateBtn.innerHTML = originalText;
                    generateBtn.disabled = false;
                    if(promptInput) promptInput.disabled = false;
                }
            });
        }
    }
    
    // --- LOGIKA PRO STUDENTA ---
    function setupStudentNav() {
        const nav = document.getElementById('main-nav');
        nav.innerHTML = `<li><button class="nav-item p-3 rounded-lg flex items-center justify-center text-white bg-green-600" title="Moje studium"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></button></li>`;
    }

    function initStudentDashboard() {
        const sidebar = document.querySelector('#dashboard-student aside');
        currentLesson = lessonsData.find(l => l.id === "1"); 

        sidebar.innerHTML = `
            <h2 class="text-xl font-bold text-slate-800 mb-2">${currentLesson.title}</h2>
            <p class="text-sm text-slate-500 mb-6">Lekce ${currentLesson.number}</p>
            <nav id="student-lesson-menu" class="flex flex-col space-y-1">
                <a href="#" data-view="overview" class="student-menu-item p-3 rounded-md font-semibold flex items-center bg-green-100 text-green-800">📖<span class="ml-3">Přehled lekce</span></a>
                <a href="#" data-view="text_video" class="student-menu-item p-3 rounded-md hover:bg-slate-100 flex items-center">📺<span class="ml-3">Text a Video</span></a>
                <a href="#" data-view="interactive" class="student-menu-item p-3 rounded-md hover:bg-slate-100 flex items-center">💬<span class="ml-3">Interaktivní část</span></a>
                <a href="#" data-view="post" class="student-menu-item p-3 rounded-md hover:bg-slate-100 flex items-center">🎧<span class="ml-3">Podcasty a materiály</span></a>
            </nav>`;
        
        const menu = sidebar.querySelector('#student-lesson-menu');
        menu.addEventListener('click', e => {
            e.preventDefault();
            const target = e.target.closest('.student-menu-item');
            if (target) {
                menu.querySelectorAll('.student-menu-item').forEach(item => item.classList.remove('bg-green-100', 'text-green-800'));
                target.classList.add('bg-green-100', 'text-green-800');
                renderStudentContent(target.dataset.view);
            }
        });
        
        renderStudentContent('overview');
    }

    function renderStudentContent(viewId) {
        const container = document.getElementById('student-content-area');
        container.className = 'flex-grow p-4 sm:p-6 md:p-8 overflow-y-auto bg-slate-50 view-transition';
        let contentHTML = '';
        
        switch(viewId) {
            case 'overview':
                contentHTML = `<div class="bg-white p-8 rounded-2xl shadow-xl mb-8"><h1 class="text-4xl font-extrabold text-slate-800">${currentLesson.title}</h1><p class="text-slate-500 mt-2">Lekce ${currentLesson.number} | Odhadovaný čas: 45 minut</p><div class="mt-8 border-t border-slate-200 pt-6"><h3 class="font-semibold text-lg text-slate-700 mb-3">Co se v této lekci naučíte:</h3><ul class="list-disc list-inside space-y-2 text-slate-600"><li>Pochopit základní principy kvantového světa.</li><li>Rozlišovat mezi klasickou a kvantovou fyzikou.</li><li>Seznámit se s pojmy jako superpozice a dualismus.</li></ul></div></div><div class="bg-white p-8 rounded-2xl shadow-xl"><h2 class="text-2xl font-bold mb-4 text-slate-800">Váš Osobní Studijní Plán od AI Sensei</h2><div class="relative pl-6 border-l-2 border-green-500"><div class="mb-8 relative"><div class="absolute -left-[34px] top-1 w-4 h-4 bg-green-500 rounded-full border-4 border-white"></div><p class="font-bold text-green-600">Právě studujete</p><p class="text-lg">${currentLesson.title}</p></div><div class="mb-8 relative"><div class="absolute -left-[34px] top-1 w-4 h-4 bg-amber-500 rounded-full border-4 border-white"></div><p class="font-bold text-amber-600">Doporučené zaměření</p><p class="text-lg">Zopakovat si 'Princip Superpozice'</p><p class="text-sm text-slate-500">Na základě vašeho posledního kvízu vám AI doporučuje věnovat více času tomuto tématu.</p></div><div class="relative"><div class="absolute -left-[34px] top-1 w-4 h-4 bg-slate-400 rounded-full border-4 border-white"></div><p class="font-bold text-slate-500">Další na řadě</p><p class="text-lg">${lessonsData.find(l=>l.id==="2").title}</p></div></div></div>`;
                break;
            case 'text_video':
                contentHTML = `<div class="space-y-8"><div class="bg-white p-8 rounded-2xl shadow-xl"><h2 class="text-3xl font-bold mb-4">Studijní text</h2><div class="prose max-w-none text-slate-700 leading-relaxed">${currentLesson.content.replace(/\n/g, '<br>')}</div></div><div class="bg-white p-8 rounded-2xl shadow-xl"><h2 class="text-3xl font-bold mb-4">Video k lekci</h2><div class="rounded-xl overflow-hidden aspect-video shadow-lg"><iframe src="https://www.youtube.com/embed/i-z_I1_Z2lY" frameborder="0" allowfullscreen class="w-full h-full"></iframe></div></div></div>`;
                break;
            case 'interactive':
                contentHTML = `<div class="flex justify-center"><div class="phone-mockup"><div class="phone-screen"><div class="phone-header flex items-center space-x-3"><span class="font-semibold text-lg">🤖 AI Sensei Bot</span></div><div id="chat-area" class="chat-area"><div class="chat-bubble chat-bubble-bot shadow">Ahoj! Jsem tvůj studijní asistent pro lekci "${currentLesson.title}". Zeptej se mě na cokoliv, co tě zajímá!</div></div><div class="p-2 bg-white border-t"><div class="flex items-center space-x-2"><input type="text" id="student-chat-input" placeholder="Zeptej se na něco..." class="w-full bg-slate-100 border-transparent rounded-full p-3 focus:ring-2 focus:ring-green-500"><button id="student-chat-send" class="p-3 bg-green-700 text-white rounded-full hover:bg-green-800"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div></div></div></div></div>`;
                break;
            case 'post':
                 contentHTML = `<div class="bg-white p-8 rounded-2xl shadow-xl"><h2 class="text-3xl font-bold mb-6">Podcasty a materiály</h2><h3 class="font-semibold mb-4 text-lg">Exkluzivní série podcastů k lekci:</h3><div class="space-y-4"><div class="bg-slate-800 text-white p-4 rounded-lg flex items-center space-x-4"><button class="text-3xl">▶️</button><div><p class="font-bold">Epizoda 1: Záhada kvantového světa</p><p class="text-sm text-slate-400">Odhalujeme, proč se nejmenší částice chovají tak podivně.</p></div></div><div class="bg-slate-800 text-white p-4 rounded-lg flex items-center space-x-4"><button class="text-3xl">▶️</button><div><p class="font-bold">Epizoda 2: Živá i mrtvá kočka</p><p class="text-sm text-slate-400">Ponořte se do principu superpozice s naším myšlenkovým experimentem.</p></div></div><div class="bg-slate-800 text-white p-4 rounded-lg flex items-center space-x-4"><button class="text-3xl">▶️</button><div><p class="font-bold">Epizoda 3: Kvantové počítače: Budoucnost je tady</p><p class="text-sm text-slate-400">Jak principy kvantové mechaniky mění svět technologií.</p></div></div></div><h3 class="font-semibold mt-8 mb-4 text-lg">Materiály ke stažení:</h3><a href="#" class="flex items-center p-3 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">📄<span class="ml-3 font-medium">sylabus_kvantovka.pdf</span></a></div>`;
                break;
        }
        container.innerHTML = contentHTML;

        if (viewId === 'interactive') {
            const sendBtn = document.getElementById('student-chat-send');
            const input = document.getElementById('student-chat-input');
            sendBtn.addEventListener('click', handleStudentChat);
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleStudentChat();
            });
        }
    }
    
    async function handleStudentChat() {
        const chatArea = document.getElementById('chat-area');
        const input = document.getElementById('student-chat-input');
        const userMessage = input.value.trim();
        if (!userMessage) return;

        const userBubble = document.createElement('div');
        userBubble.className = 'chat-bubble chat-bubble-user';
        userBubble.textContent = userMessage;
        chatArea.appendChild(userBubble);
        input.value = '';
        chatArea.scrollTop = chatArea.scrollHeight;
        
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'chat-bubble chat-bubble-bot typing-indicator';
        typingIndicator.innerHTML = '<span></span><span></span><span></span>';
        chatArea.appendChild(typingIndicator);
        chatArea.scrollTop = chatArea.scrollHeight;

        const systemInstruction = `Jsi "AI Sensei", přátelský asistent. Kontext lekce "${currentLesson.title}":\n\n${currentLesson.content}`;
        const result = await callGeminiApi(userMessage, systemInstruction);

        chatArea.removeChild(typingIndicator);
        const botBubble = document.createElement('div');
        botBubble.className = 'chat-bubble chat-bubble-bot';
        botBubble.textContent = result.error || result.text;
        chatArea.appendChild(botBubble);
        chatArea.scrollTop = chatArea.scrollHeight;
    }
    
    // --- POMOCNÉ MODÁLY A SEKCE ---
    function showAiAssistant() {
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = `
            <div class="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
                <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg transform transition-all modal-transition">
                     <header class="p-4 border-b border-slate-200 flex justify-between items-center">
                         <h3 class="text-xl font-semibold">🤖 AI Asistent Sensei</h3>
                         <button id="close-modal-btn" class="p-2 rounded-full hover:bg-slate-100">✖</button>
                     </header>
                     <main class="p-6">
                         <p class="mb-4">Dobrý den, profesore! Co pro vás mohu udělat?</p>
                         <div class="space-y-3">
                             <button class="w-full text-left p-3 bg-slate-100 hover:bg-slate-200 rounded-lg">Navrhni mi strukturu nové lekce</button>
                             <button class="w-full text-left p-3 bg-slate-100 hover:bg-slate-200 rounded-lg">Vytvoř 3 kreativní otázky k zamyšlení</button>
                         </div>
                     </main>
                </div>
            </div>`;
        document.getElementById('close-modal-btn').addEventListener('click', () => modalContainer.innerHTML = '');
    }

    function showMediaLibrary() {
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = `
            <div class="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
                <div class="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col modal-transition">
                    <header class="p-4 border-b border-slate-200 flex justify-between items-center">
                        <h3 class="text-xl font-semibold">Knihovna médií</h3>
                        <button id="close-modal-btn" class="p-2 rounded-full hover:bg-slate-100">✖</button>
                    </header>
                    <main class="p-6 overflow-y-auto">
                         <div class="upload-zone rounded-lg p-10 text-center mb-6"><p>Přetáhněte soubory sem</p></div>
                         <div class="grid grid-cols-2 md:grid-cols-6 gap-4">
                         </div>
                    </main>
                </div>
            </div>`;
        document.getElementById('close-modal-btn').addEventListener('click', () => modalContainer.innerHTML = '');
    }

    function renderStudentInteractions(container) {
         container.innerHTML = `<div class="p-8"><h2>Interakce se studenty</h2><p>Tato sekce se připravuje.</p></div>`;
    }

    function renderAnalytics(container) {
        container.innerHTML = `<div class="p-8"><h2>Analýza studentů</h2><p>Tato sekce se připravuje.</p></div>`;
    }

    init();
});