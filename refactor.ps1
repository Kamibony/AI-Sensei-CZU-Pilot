# Este script realiza o refactoring do projeto AI Sensei para uma forma modular.

Write-Host "🚀 Iniciando o refactoring do projeto..." -ForegroundColor Cyan

# --- Código para public/js/api.js ---
$apiJsContent = @'
// Sua chave da API Gemini
const API_KEY = "AIzaSyAw4WY-pf5xdSDJ-MG2Y9MKjratXJhfQSA";

/**
 * Função universal para chamar a API Gemini para geração de texto.
 * @param {string} prompt - O texto de entrada para o modelo.
 * @returns {Promise<object>} - Um objeto com o texto gerado ou um erro.
 */
export async function callGeminiApi(prompt) {
    console.log("Chamando a API Gemini com o prompt:", prompt);
    // Simulação de atraso de rede
    await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
    
    if (!prompt) {
        return { error: "O prompt não pode estar vazio." };
    }
    
    // Resposta simulada
    const simulatedResponse = `
   Esta é uma **resposta simulada e excelentemente escrita** da API Gemini.
   <br><br>
   O texto seria, obviamente, mais longo e detalhado, mas para os propósitos desta demonstração, ele mostra a capacidade da IA de gerar conteúdo relevante e envolvente a partir de uma instrução simples do professor. O sistema pode adaptar o estilo, o tom e a complexidade do texto de acordo com a solicitação, economizando horas de preparação.
   <br><br>
   Exemplo de estrutura:
   <ul>
       <li class="ml-4 list-disc">Introdução ao tópico</li>
       <li class="ml-4 list-disc">Conceitos-chave</li>
       <li class="ml-4 list-disc">Exemplos práticos</li>
       <li class="ml-4 list-disc">Resumo final</li>
   </ul>
   `;
    return { text: simulatedResponse };
}
'@

# --- Código para public/js/editor-handler.js ---
$editorHandlerJsContent = @'
import { callGeminiApi } from './api.js';

let currentLesson = null;
let db = null;

/**
 * Inicializa o editor e define as variáveis necessárias.
 * @param {object} lesson - A lição atualmente sendo editada.
 * @param {object} firestoreDb - A instância do banco de dados Firestore.
 */
export function initializeEditor(lesson, firestoreDb) {
    currentLesson = lesson;
    db = firestoreDb;
}

/**
 * Renderiza o conteúdo específico do editor com base na visualização selecionada (viewId).
 * @param {string} viewId - O ID da visualização ('details', 'text', etc.).
 * @returns {string} - O conteúdo HTML para a visualização correspondente.
 */
export function getEditorContent(viewId) {
    switch(viewId) {
        case 'details':
            return renderDetailsView();
        case 'text':
            return renderTextView();
        // Visualizações futuras (quiz, apresentação...) serão adicionadas aqui
        default:
            return `<p>O conteúdo para a seção '${viewId}' está em preparação.</p>`;
    }
}

/**
 * Anexa os event listeners aos elementos do DOM após a renderização.
 * @param {string} viewId - O ID da visualização para a qual os listeners devem ser anexados.
 */
export function attachEditorEventListeners(viewId) {
    if (viewId === 'text') {
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', handleTextGeneration);
        }
    }
}

function renderDetailsView() {
    return `
        <div id="lesson-details-form" class="space-y-4">
            <div><label class="block font-medium text-slate-600 mb-1">Nome da lição</label><input id="lesson-title" type="text" class="w-full p-2 rounded-lg form-input" value="${currentLesson?.title || ''}"></div>
            <div><label class="block font-medium text-slate-600 mb-1">Subtítulo</label><input id="lesson-subtitle" type="text" class="w-full p-2 rounded-lg form-input" value="${currentLesson?.subtitle || ''}"></div>
            <div><label class="block font-medium text-slate-600 mb-1">Ícone (emoji)</label><input id="lesson-icon" type="text" class="w-full p-2 rounded-lg form-input" value="${currentLesson?.icon || '🆕'}"></div>
            <div class="text-right pt-4"><button id="save-lesson-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800">Salvar lição</button></div>
        </div>
    `;
}

function renderTextView() {
    return `
        <p class="text-slate-500 mb-4">Insira um prompt de IA para gerar o texto de estudo principal para esta lição.</p>
        <textarea id="prompt-input" class="w-full border-slate-300 rounded-lg p-2 h-24" placeholder="Ex: 'Crie um texto introdutório envolvente sobre os princípios da mecânica quântica para iniciantes...'"></textarea>
        <div class="flex items-center justify-between mt-4">
            <div class="flex items-center space-x-4">
                <label class="font-medium">Comprimento:</label>
                <select id="length-select" class="rounded-lg border-slate-300"><option>Curto</option><option selected>Médio</option><option>Longo</option></select>
            </div>
            <button id="generate-btn" class="px-5 py-2 bg-amber-800 text-white font-semibold rounded-lg hover:bg-amber-900 transition flex items-center">✨<span class="ml-2">Gerar texto</span></button>
        </div>
        <div id="generation-output" class="mt-6 border-t pt-6 text-slate-700 prose max-w-none">
            <div class="text-center p-8 text-slate-400">O conteúdo será gerado aqui...</div>
        </div>
    `;
}

async function handleTextGeneration() {
    const outputEl = document.getElementById('generation-output');
    const promptInput = document.getElementById('prompt-input');
    const generateBtn = document.getElementById('generate-btn');
    const length = document.getElementById('length-select').value;
    const prompt = `Crie um texto de estudo com comprimento "${length}" com base na seguinte instrução: "${promptInput.value.trim()}"`;

    if (!promptInput.value.trim()) {
        outputEl.innerHTML = '<div class="p-4 bg-red-100 text-red-700 rounded-lg">Por favor, insira um texto no prompt.</div>';
        return;
    }

    const originalText = generateBtn.innerHTML;
    generateBtn.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"></div><span class="ml-2">Gerando...</span>';
    generateBtn.disabled = true;
    outputEl.innerHTML = '<div class="p-8 text-center text-slate-500">🤖 AI Sensei está pensando e criando o conteúdo...</div>';

    try {
        const result = await callGeminiApi(prompt);
        if (result.error) throw new Error(result.error);
        outputEl.innerHTML = `<div class="prose max-w-none">${result.text}</div>`;
    } catch (e) {
        outputEl.innerHTML = `<div class="p-4 bg-red-100 text-red-700 rounded-lg">Ocorreu um erro: ${e.message}</div>`;
    } finally {
        generateBtn.innerHTML = originalText;
        generateBtn.disabled = false;
    }
}
'@

# --- Código para public/index.html ---
$indexHtmlContent = @'
<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Sensei pro ČZU</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; }
        .lesson-bubble { position: relative; cursor: grab; }
        .lesson-bubble:active { cursor: grabbing; transform: scale(1.05); box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .dragging { opacity: 0.5; border: 2px dashed #166534; }
        .drag-over { border-style: dashed; border-color: #166534; background-color: #f0fdf4; }
        .view-transition { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .form-input {
            border: 1px solid #cbd5e1;
            transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
        }
        .form-input:focus {
            outline: none;
            border-color: #166534;
            box-shadow: 0 0 0 2px rgba(22, 101, 52, 0.2);
        }
        .upload-zone.drag-over-file {
            border-color: #166534;
            background-color: #f0fdf4;
        }
        .spinner-border {
            display: inline-block;
            width: 1rem;
            height: 1rem;
            vertical-align: text-bottom;
            border: .2em solid currentColor;
            border-right-color: transparent;
            border-radius: 50%;
            animation: spinner-border .75s linear infinite;
        }
        @keyframes spinner-border {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body class="bg-slate-100">

    <div id="app-container"></div>

    <script type="module">
        // Import Firebase
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
        import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
        import { getFirestore, collection, getDocs, query, orderBy, doc, getDoc, setDoc, addDoc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
        import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
        import { connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
        import { connectStorageEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
        
        // Import nossos módulos
        import { initializeUpload } from './js/upload-handler.js';
        import { initializeEditor, getEditorContent, attachEditorEventListeners } from './js/editor-handler.js';

        // Configuração do Firebase
        const firebaseConfig = {
          apiKey: "AIzaSyB3mUbw9cC8U6UzUNvPadrwdhjXFcu3aeA",
          authDomain: "ai-sensei-czu-pilot.firebaseapp.com",
          projectId: "ai-sensei-czu-pilot",
          storageBucket: "ai-sensei-czu-pilot.appspot.com",
          messagingSenderId: "413145704611",
          appId: "1:413145704611:web:75f8e571995276f99af716",
          measurementId: "G-4QDC0F2Q6Q"
        };

        // Inicialização do Firebase
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);
        const storage = getStorage(app); 

        // Conexão com os emuladores
        if (window.location.hostname === "localhost") {
            console.log("DESENVOLVIMENTO LOCAL: Conectando aos emuladores do Firebase...");
            connectFirestoreEmulator(db, "127.0.0.1", 8080);
            connectStorageEmulator(storage, "127.0.0.1", 9199);
        }

        const appContainer = document.getElementById('app-container');
        
        // --- ESTADO DA APLICAÇÃO ---
        let allLessons = [];
        let timelineData = {};
        let currentView = 'timeline';
        let currentLesson = null;
        let activeEditorView = 'details';

        // --- FUNÇÕES PRINCIPAIS DA APLICAÇÃO ---

        function renderLoginScreen() {
            appContainer.innerHTML = `
                <div class="w-full h-screen flex items-center justify-center p-4">
                    <div class="w-full max-w-md p-8 lg:p-10 space-y-6 bg-white rounded-2xl shadow-xl text-center">
                        <div class="inline-block p-4 bg-green-100 rounded-full"><span class="text-4xl font-black text-green-800">ČZU</span></div>
                        <h1 class="text-3xl font-extrabold text-slate-800">Bem-vindo ao AI Sensei</h1>
                        <p class="text-slate-500">Por favor, escolha seu papel para entrar no sistema.</p>
                        <div class="space-y-4 pt-4">
                            <button id="login-professor" class="w-full py-3 px-4 rounded-xl shadow-sm text-lg font-semibold text-white bg-green-700 hover:bg-green-800 transition">Entrar como Professor</button>
                        </div>
                    </div>
                </div>
            `;
            document.getElementById('login-professor').addEventListener('click', () => signInAnonymously(auth));
        }

        async function renderProfessorDashboard() {
            if (currentView === 'timeline') await renderTimelineView();
            else if (currentView === 'editor') renderEditorView();
        }

        async function renderTimelineView() {
            appContainer.innerHTML = `
                <div class="h-screen w-screen flex bg-white shadow-lg overflow-hidden">
                    <nav class="w-20 bg-green-800 p-3 flex flex-col items-center justify-between flex-shrink-0">
                         <div><a href="#" class="w-12 h-12 rounded-full flex items-center justify-center mb-8 bg-white text-green-800" title="AI Sensei para ČZU"><span class="text-xl font-black">ČZU</span></a></div>
                        <button id="logout-btn" class="p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white transition-colors" title="Sair"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>
                    </nav>
                    <aside id="professor-sidebar" class="w-full md:w-96 bg-white border-r border-slate-200 flex flex-col flex-shrink-0"><div class="p-4 border-b border-slate-200"><h2 class="text-xl font-bold text-slate-800">Carregando biblioteca...</h2></div></aside>
                    <main id="main-content-area" class="flex-grow bg-slate-100 flex flex-col h-screen"><div class="p-8 text-center"><p>Carregando linha do tempo...</p></div></main>
                </div>
            `;
            document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));
            await fetchAndRenderLessons();
        }

        function renderEditorView() {
             appContainer.innerHTML = `
                <div class="h-screen w-screen flex bg-white shadow-lg overflow-hidden">
                     <nav class="w-20 bg-green-800 p-3 flex flex-col items-center justify-between flex-shrink-0">
                         <div><a href="#" class="w-12 h-12 rounded-full flex items-center justify-center mb-8 bg-white text-green-800" title="AI Sensei para ČZU"><span class="text-xl font-black">ČZU</span></a></div>
                        <button id="logout-btn" class="p-3 rounded-lg flex items-center justify-center text-green-200 hover:bg-green-700 hover:text-white transition-colors" title="Sair"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>
                    </nav>
                    <aside id="professor-sidebar" class="w-full md:w-96 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 view-transition"></aside>
                    <main id="main-content-area" class="flex-grow bg-slate-100 flex flex-col h-screen view-transition"></main>
                </div>
            `;
            document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));
            renderEditorSidebar();
            renderEditorContent(activeEditorView);
        }

        function renderEditorSidebar() {
            const sidebar = document.getElementById('professor-sidebar');
            const menuItems = [
                { id: 'details', label: 'Detalhes da lição', icon: '📝' },
                { id: 'docs', label: 'Documentos da lição', icon: '📁' },
                { id: 'text', label: 'Texto para estudantes', icon: '✍️' },
            ];
            const menuHTML = menuItems.map(item => `<a href="#" data-view="${item.id}" class="editor-menu-item flex items-center p-3 text-sm font-medium rounded-md hover:bg-slate-100 transition-colors">${item.icon}<span class="ml-3">${item.label}</span></a>`).join('');
            sidebar.innerHTML = `
                <header class="p-4 border-b border-slate-200 flex-shrink-0">
                    <button id="back-to-timeline-btn" class="flex items-center text-sm text-green-700 hover:underline mb-3">&larr; Voltar para a linha do tempo</button>
                    <div class="flex items-center space-x-3">
                        <span id="lesson-icon-display" class="text-3xl">${currentLesson?.icon || '🆕'}</span>
                        <h2 id="lesson-title-display" class="text-xl font-bold truncate text-slate-800">${currentLesson?.title || 'Criar nova lição'}</h2>
                    </div>
                </header>
                <div class="flex-grow overflow-y-auto p-2"><nav>${menuHTML}</nav></div>
            `;
            document.getElementById('back-to-timeline-btn').addEventListener('click', () => {
                currentView = 'timeline';
                currentLesson = null;
                renderProfessorDashboard();
            });
            sidebar.querySelectorAll('.editor-menu-item').forEach(item => {
                item.addEventListener('click', e => {
                    e.preventDefault();
                    activeEditorView = item.dataset.view;
                    renderEditorContent(activeEditorView);
                });
            });
        }
        
        function renderEditorContent(viewId) {
            const mainArea = document.getElementById('main-content-area');
            const renderWrapper = (title, content) => `<div class="p-8 overflow-y-auto h-full"><h2 class="text-3xl font-extrabold text-slate-800 mb-6">${title}</h2><div class="bg-white p-6 rounded-2xl shadow-lg">${content}</div></div>`;
            
            initializeEditor(currentLesson, db); // Passa a lição atual e o db para o módulo
            let contentHTML = "";

            if (viewId === 'docs') {
                 contentHTML = renderWrapper('Documentos da lição', `
                    <p class="text-slate-500 mb-4">Carregue arquivos específicos para esta lição (ex: syllabus, textos complementares).</p>
                    <label for="file-upload-input" id="upload-zone" class="block border-2 border-dashed border-slate-300 rounded-lg p-10 text-center text-slate-500 cursor-pointer hover:border-green-600 hover:bg-green-50 transition-colors">
                        <p class="font-semibold">Arraste os arquivos para cá ou clique para selecionar</p>
                        <p class="text-sm">Tamanho máximo de 10MB</p>
                    </label>
                    <input type="file" id="file-upload-input" class="hidden" multiple>
                    <div id="upload-progress" class="mt-4 space-y-2"></div>
                    <h3 class="font-bold text-slate-700 mt-6 mb-2">Arquivos carregados:</h3>
                    <ul id="documents-list" class="space-y-2">
                       <li class="text-center text-slate-400 text-sm">Nenhum documento foi carregado.</li>
                    </ul>`);
            } else {
                // Para outras visualizações, chama o módulo do editor
                const titleMap = { 'details': 'Detalhes da lição', 'text': 'Texto para estudantes' };
                const editorBody = getEditorContent(viewId);
                contentHTML = renderWrapper(titleMap[viewId] || 'Editor', editorBody);
            }
            
            mainArea.innerHTML = contentHTML;
            
            document.querySelectorAll('.editor-menu-item').forEach(el => el.classList.toggle('bg-green-100 text-green-800 font-semibold', el.dataset.view === viewId));

            if (viewId === 'docs') {
                initializeUpload(currentLesson, db, storage);
            } else if (viewId === 'details') {
                document.getElementById('save-lesson-btn').addEventListener('click', saveLessonDetails);
            }
            // Anexa os listeners para todas as visualizações do editor-handler
            attachEditorEventListeners(viewId);
        }

        async function saveLessonDetails() {
            const title = document.getElementById('lesson-title').value;
            const subtitle = document.getElementById('lesson-subtitle').value;
            const icon = document.getElementById('lesson-icon').value;
            if (!title) { alert("O nome da lição é obrigatório."); return; }
            const lessonData = { title, subtitle, icon, status: currentLesson?.status || 'Planejado' };
            const saveBtn = document.getElementById('save-lesson-btn');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Salvando...';
            try {
                if (currentLesson) {
                    await updateDoc(doc(db, "lessons", currentLesson.id), lessonData);
                    currentLesson = { ...currentLesson, ...lessonData };
                } else {
                    lessonData.creationDate = serverTimestamp();
                    const docRef = await addDoc(collection(db, "lessons"), lessonData);
                    currentLesson = { id: docRef.id, ...lessonData };
                }
                alert("Lição salva com sucesso.");
                document.getElementById('lesson-title-display').textContent = currentLesson.title;
                document.getElementById('lesson-icon-display').textContent = currentLesson.icon;
            } catch (error) {
                console.error("Erro ao salvar a lição:", error);
                alert("Ocorreu um erro ao salvar.");
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Salvar lição';
            }
        }
        
        async function fetchAndRenderLessons() {
            try {
                const q = query(collection(db, "lessons"), orderBy("creationDate", "desc"));
                const querySnapshot = await getDocs(q);
                allLessons = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const timelineDoc = await getDoc(doc(db, "timeline", "professorView"));
                timelineData = timelineDoc.exists() ? timelineDoc.data() : {};
                renderLessonLibrary(allLessons);
                renderTimeline();
            } catch (error) {
                console.error("Erro ao carregar dados do Firestore:", error);
                document.getElementById('professor-sidebar').innerHTML = `<div class="p-4 text-red-600">Não foi possível carregar os dados.</div>`;
            }
        }

        function renderLessonLibrary(lessons) {
            const sidebar = document.getElementById('professor-sidebar');
            const statuses = ['Ativo', 'Planejado', 'Arquivado'];
            const libraryHTML = statuses.map(status => {
                const lessonsInStatus = lessons.filter(l => l.status === status);
                return `<div class="p-2"><h3 class="px-2 text-sm font-semibold text-slate-500 mb-2">${status}</h3>
                        ${lessonsInStatus.length > 0 ? lessonsInStatus.map(lesson => `
                            <div class="lesson-bubble p-3 mb-2 rounded-lg flex items-center space-x-3 cursor-pointer bg-white border border-slate-200 hover:shadow-md hover:border-green-500" data-id="${lesson.id}" draggable="true">
                                <span class="text-2xl">${lesson.icon}</span>
                                <div><span class="font-semibold text-sm text-slate-700">${lesson.title}</span><p class="text-xs text-slate-500">${lesson.subtitle}</p></div>
                            </div>`).join('') : '<p class="px-2 text-xs text-slate-400">Nenhuma lição.</p>'}</div>`;
            }).join('');
            sidebar.innerHTML = `
                <header class="p-4 border-b border-slate-200 flex justify-between items-center"><h2 class="text-xl font-bold text-slate-800">Biblioteca de lições</h2><button id="new-lesson-btn" class="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800 transition">+ Nova lição</button></header>
                <div class="flex-grow overflow-y-auto">${libraryHTML}</div>`;
            document.getElementById('new-lesson-btn').addEventListener('click', () => {
                currentView = 'editor';
                currentLesson = null;
                activeEditorView = 'details';
                renderProfessorDashboard();
            });
            sidebar.querySelectorAll('.lesson-bubble').forEach(el => {
                el.addEventListener('click', () => {
                    currentView = 'editor';
                    currentLesson = allLessons.find(l => l.id === el.dataset.id);
                    activeEditorView = 'details';
                    renderProfessorDashboard();
                });
                el.addEventListener('dragstart', (e) => {
                    e.target.classList.add('dragging');
                    e.dataTransfer.setData('lesson_id', e.target.dataset.id);
                });
                el.addEventListener('dragend', (e) => e.target.classList.remove('dragging'));
            });
        }
        
        function renderTimeline() {
            const mainArea = document.getElementById('main-content-area');
            mainArea.innerHTML = `<header class="text-center p-6 border-b border-slate-200 bg-white"><h1 class="text-3xl font-extrabold text-slate-800">Plano de aulas</h1><p class="text-slate-500 mt-1">Planeje as lições arrastando-as da biblioteca à esquerda.</p></header>
               <div class="flex-grow overflow-y-auto p-4 md:p-6"><div id="timeline-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"></div></div>`;
           const timelineContainer = document.getElementById('timeline-container');
           timelineContainer.innerHTML = '';
           const startDate = new Date();
           for (let i = 0; i < 10; i++) {
               const dayDate = new Date();
               dayDate.setDate(startDate.getDate() + i);
               const dayKey = dayDate.toISOString().split('T')[0];
               const dayWrapper = document.createElement('div');
               dayWrapper.className = 'day-slot bg-white rounded-xl p-3 border-2 border-transparent transition-colors min-h-[250px] shadow-sm flex flex-col';
               dayWrapper.dataset.dayKey = dayKey;
               const formattedDate = dayDate.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' });
               let lessonsHTML = '';
               if (timelineData[dayKey]) {
                   lessonsHTML = timelineData[dayKey].map(lessonId => {
                       const lesson = allLessons.find(l => l.id === lessonId);
                       if (!lesson) return '';
                       return `<div class="lesson-bubble-in-timeline p-2 mt-2 rounded-lg flex items-center space-x-2 bg-green-100 border border-green-200 text-sm"><span class="text-lg">${lesson.icon}</span><span class="font-semibold">${lesson.title}</span></div>`;
                   }).join('');
               }
               dayWrapper.innerHTML = `<div class="text-center pb-2 mb-2 border-b border-slate-200"><p class="font-bold text-slate-700">${formattedDate}</p></div><div class="lessons-container flex-grow">${lessonsHTML}</div>`;
               timelineContainer.appendChild(dayWrapper);
           }
           addDragAndDropListeners();
        }

        function addDragAndDropListeners() {
            document.querySelectorAll('.day-slot').forEach(zone => {
                zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
                zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'); });
                zone.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    zone.classList.remove('drag-over');
                    const lessonId = e.dataTransfer.getData('lesson_id');
                    const dayKey = zone.dataset.dayKey;
                    Object.keys(timelineData).forEach(key => { timelineData[key] = timelineData[key].filter(id => id !== lessonId); });
                    if (!timelineData[dayKey]) timelineData[dayKey] = [];
                    if (!timelineData[dayKey].includes(lessonId)) timelineData[dayKey].push(lessonId);
                    await saveTimelineToFirestore();
                    renderTimeline();
                });
            });
        }
        
        async function saveTimelineToFirestore() {
            try {
                await setDoc(doc(db, "timeline", "professorView"), timelineData);
                console.log("Linha do tempo salva no Firestore.");
            } catch (error) {
                console.error("Erro ao salvar a linha do tempo:", error);
                alert("Ocorreu um erro ao salvar as alterações.");
            }
        }

        // --- ROTEADOR DA APLICAÇÃO ---
        onAuthStateChanged(auth, (user) => {
            if (user) renderProfessorDashboard();
            else renderLoginScreen();
        });
    </script>
</body>
</html>
'@

# Vytvoření adresáře, pokud neexistuje
$jsDirPath = "public/js"
if (-not (Test-Path -Path $jsDirPath -PathType Container)) {
    New-Item -Path $jsDirPath -ItemType Directory | Out-Null
    Write-Host "Vytvořen adresář: $jsDirPath" -ForegroundColor Green
}

# Zápis obsahu do souborů
try {
    $apiJsContent | Set-Content -Path (Join-Path $jsDirPath "api.js") -Encoding UTF8
    Write-Host "✅ Soubor 'public/js/api.js' byl úspěšně vytvořen/aktualizován." -ForegroundColor Green

    $editorHandlerJsContent | Set-Content -Path (Join-Path $jsDirPath "editor-handler.js") -Encoding UTF8
    Write-Host "✅ Soubor 'public/js/editor-handler.js' byl úspěšně vytvořen/aktualizován." -ForegroundColor Green

    $indexHtmlContent | Set-Content -Path "public/index.html" -Encoding UTF8
    Write-Host "✅ Soubor 'public/index.html' byl úspěšně aktualizován." -ForegroundColor Green
    
    Write-Host "🎉 Refactoring dokončen! Můžete spustit vývojové prostředí." -ForegroundColor Cyan
}
catch {
    Write-Host "❌ Vyskytla se chyba při zápisu souborů:" -ForegroundColor Red
    Write-Host $_
}