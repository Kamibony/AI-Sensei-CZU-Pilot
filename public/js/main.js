// --- HLAVNÍ SKRIPT APLIKACE ---
import { auth, db, storage, functions } from './firebase-init.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import {
    onAuthStateChanged,
    signOut,
    signInAnonymously,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection,
    getDocs,
    getDoc,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    setDoc,
    writeBatch,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { initializeUpload, initializeCourseMediaUpload, renderMediaLibraryFiles } from './upload-handler.js';

    const generateTextFunction = httpsCallable(functions, 'generateText');
    const generateJsonFunction = httpsCallable(functions, 'generateJson');
    const generateTelegramActivationCode = httpsCallable(functions, 'generateTelegramActivationCode');
    const sendMessageToProfessor = httpsCallable(functions, 'sendMessageToProfessor');
    const getLessonKeyTakeaways = httpsCallable(functions, 'getLessonKeyTakeaways');
    const getAiAssistantResponse = httpsCallable(functions, 'getAiAssistantResponse');


    // --- API Volání ---
    async function callGeminiApi(prompt, systemInstruction = null) {
        console.log("Volám Firebase funkci 'generateText':", { prompt, systemInstruction });
        try {
            const result = await generateTextFunction({ prompt, systemInstruction });
            return result.data;
        } catch (error) {
            console.error("Chyba při volání Firebase funkce 'generateText':", error);
            const details = error.details || {};
            return { error: `Chyba backendu: ${error.message} (kód: ${error.code}, detaily: ${JSON.stringify(details)})` };
        }
    }

    async function callGeminiForJson(prompt, schema) {
        console.log("Volám Firebase funkci 'generateJson':", { prompt, schema });
        try {
            const result = await generateJsonFunction({ prompt, schema });
            return result.data;
        } catch (error) {
            console.error("Chyba při volání Firebase funkce 'generateJson':", error);
            const details = error.details || {};
            return { error: `Chyba backendu při generování JSON: ${error.message} (kód: ${error.code}, detaily: ${JSON.stringify(details)})` };
        }
    }

    // Zpřístupnění funkcí pro ostatní skripty (např. editor-handler.js)
    window.callGeminiApi = callGeminiApi;
    window.callGeminiForJson = callGeminiForJson;

    // --- DATA A STAV APLIKACE ---
    let lessonsData = [];
    const lessonsCollection = collection(db, 'lessons');

    // Funkce pro načtení a případné nasazení počátečních dat
    async function fetchLessons() {
        try {
            const querySnapshot = await getDocs(lessonsCollection);
            if (querySnapshot.empty) {
                console.log("Databáze lekcí je prázdná, nahrávám počáteční data...");
                const initialLessons = [
                    { title: 'Úvod do Kvantové Fyziky', subtitle: 'Základní principy', number: '101', creationDate: '2025-09-20', status: 'Aktivní', icon: '⚛️', content: 'Vítejte ve fascinujícím světě kvantové mechaniky! Na rozdíl od klasické fyziky, která popisuje pohyb velkých objektů jako jsou planety nebo míče, kvantová mechanika se zabývá chováním hmoty a energie na atomární a subatomární úrovni. Jedním z klíčových a nejvíce matoucích principů je vlnově-korpuskulární dualismus, který říká, že částice jako elektrony se mohou chovat jednou jako částice a jindy jako vlny. Dalším stěžejním konceptem je princip superpozice. Představte si minci, která se točí ve vzduchu. Dokud nedopadne, není ani panna, ani orel - je v jakémsi stavu obou možností najednou. Podobně může být kvantová částice ve více stavech současně, dokud ji nezačneme měřit. Teprve měřením "donutíme" částici vybrat si jeden konkrétní stav.' },
                    { title: 'Historie Starověkého Říma', subtitle: 'Od republiky k císařství', number: '203', creationDate: '2025-09-18', status: 'Aktivní', icon: '🏛️', content: 'Dějiny starověkého Říma jsou příběhem o vzestupu malé městské osady na Apeninském poloostrově v globální impérium. Počátky se datují do 8. století př. n. l. a končí pádem Západořímské říše v roce 476 n. l. Římská republika, založená kolem roku 509 př. n. l., byla charakteristická systémem volených magistrátů a silným senátem.' },
                    { title: 'Základy botaniky', subtitle: 'Fotosyntéza a růst', number: 'B05', creationDate: '2025-09-15', status: 'Naplánováno', icon: '🌱', content: 'Botanika je věda o rostlinách. Klíčovým procesem pro život na Zemi je fotosyntéza, při které zelené rostliny využívají sluneční světlo, vodu a oxid uhličitý k výrobě glukózy (energie) a kyslíku. Tento proces probíhá v chloroplastech, které obsahují zelené barvivo chlorofyl.' },
                    { title: 'Shakespearova dramata', subtitle: 'Tragédie a komedie', number: 'LIT3', creationDate: '2025-09-12', status: 'Archivováno', icon: '🎭', content: 'William Shakespeare je považován za jednoho z největších dramatiků všech dob. Jeho hry se dělí na tragédie (Hamlet, Romeo a Julie), komedie (Sen noci svatojánské) a historické hry. Jeho dílo je charakteristické komplexními postavami, poetickým jazykem a nadčasovými tématy lásky, zrady, moci a smrti.'},
                    { title: 'Neuronové sítě', subtitle: 'Úvod do hlubokého učení', number: 'AI-5', creationDate: '2025-09-21', status: 'Naplánováno', icon: '🧠', content: 'Neuronové sítě jsou základním stavebním kamenem moderní umělé inteligence a hlubokého učení. Jsou inspirovány strukturou lidského mozku a skládají se z propojených uzlů neboli "neuronů", které zpracovávají a přenášejí informace. Učí se na základě velkých objemů dat tím, že upravují váhy spojení mezi neurony.' },
                ];
                for (const lesson of initialLessons) {
                    await addDoc(lessonsCollection, { ...lesson, createdAt: serverTimestamp() });
                }
                // After seeding, fetch the data again to get the generated IDs
                const newQuerySnapshot = await getDocs(lessonsCollection);
                lessonsData = newQuerySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            } else {
                 lessonsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }
            console.log("Lekce úspěšně načteny z Firestore:", lessonsData);
        } catch (error) {
            console.error("Chyba při načítání lekcí z Firestore: ", error);
            alert("Nepodařilo se načíst data lekcí. Zkuste prosím obnovit stránku.");
        }
    }


    let currentUserRole = null;
    let currentLesson = null;
    const appContainer = document.getElementById('app-container');
    
    // --- HLAVNÍ LOGIKA APLIKACE (ROUTER) ---

    // The application always starts at the role selection page.
    // The user's role is stored in sessionStorage only after they click a button.
    onAuthStateChanged(auth, (user) => {
        // Clear session storage on auth state change to ensure clean login.
        sessionStorage.removeItem('userRole');
        currentUserRole = null;
        currentLesson = null;
        renderLogin();
    });

    function renderLogin() {
        appContainer.classList.remove('hidden'); // Ensure the main container is visible
        appContainer.innerHTML = document.getElementById('login-template').innerHTML;
        document.getElementById('ai-assistant-btn').style.display = 'none';

        const handleProfessorLogin = async () => {
            try {
                // Professor login remains anonymous for simplicity
                if (!auth.currentUser || auth.currentUser.isAnonymous) {
                     await signInAnonymously(auth);
                }
                sessionStorage.setItem('userRole', 'professor');
                await login('professor');
            } catch (error) {
                console.error("Professor anonymous sign-in failed:", error);
                alert("Přihlášení pro profesora selhalo.");
            }
        };

        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        const showRegisterLink = document.getElementById('show-register-form');
        const showLoginLink = document.getElementById('show-login-form');

        // Toggle form visibility
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
        });

        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            registerForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
        });

        // Handle student login
        const handleStudentLogin = async () => {
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value.trim();

            if (!email || !password) {
                alert('Prosím, zadejte email a heslo.');
                return;
            }

            try {
                await signInWithEmailAndPassword(auth, email, password);
                console.log('Student signed in successfully.');
                sessionStorage.setItem('userRole', 'student');
                await login('student');
            } catch (error) {
                console.error("Student sign-in failed:", error);
                if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
                    alert('Přihlášení selhalo: Nesprávný email nebo heslo.');
                } else {
                    alert(`Přihlášení selhalo: ${error.message}`);
                }
            }
        };

        // Handle student registration
        const handleStudentRegister = async () => {
            const email = document.getElementById('register-email').value.trim();
            const password = document.getElementById('register-password').value.trim();

            if (!email || !password) {
                alert('Prosím, zadejte email a heslo.');
                return;
            }

            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                console.log('New student account created.');

                await setDoc(doc(db, "students", userCredential.user.uid), {
                    email: userCredential.user.email,
                    createdAt: serverTimestamp()
                });
                console.log('Student document created in Firestore.');

                sessionStorage.setItem('userRole', 'student');
                await login('student');
            } catch (error) {
                console.error("Student account creation failed:", error);
                if (error.code === 'auth/email-already-in-use') {
                    alert('Registrace se nezdařila: Tento email je již používán.');
                } else {
                    alert(`Registrace se nezdařila: ${error.message}`);
                }
            }
        };

        document.getElementById('login-professor').addEventListener('click', handleProfessorLogin);
        document.getElementById('login-btn').addEventListener('click', handleStudentLogin);
        document.getElementById('register-btn').addEventListener('click', handleStudentRegister);
    }

    async function logout() {
        try {
            await signOut(auth);
            sessionStorage.removeItem('userRole');
            currentUserRole = null;
            currentLesson = null;
        } catch (error) {
            console.error("Sign-out failed:", error);
        }
    }

    async function login(role) {
        console.log(`--- LOGIN_START: Role=${role} ---`); // ADD THIS
        currentUserRole = role;
        appContainer.innerHTML = document.getElementById('main-app-template').innerHTML;
        document.getElementById('ai-assistant-btn').style.display = 'flex';

        // Ensure data is fully loaded before attempting to render any role-specific UI
        console.log("LOGIN: Awaiting fetchLessons()..."); // ADD THIS
        await fetchLessons();
        console.log("LOGIN: fetchLessons() complete. lessonsData count:", lessonsData.length); // ADD THIS

        if (role === 'professor') {
            setupProfessorNav();
            const professorHTML = `<div id="dashboard-professor" class="w-full flex main-view active"><aside id="professor-sidebar" class="w-full md:w-96 bg-white border-r border-slate-200 flex flex-col flex-shrink-0"></aside><main id="main-content-area" class="flex-grow bg-slate-100 flex flex-col h-screen"></main></div>`;
            document.getElementById('role-content-wrapper').innerHTML = professorHTML;
            showProfessorContent('timeline');
        } else {
            setupStudentNav();
            const studentHTML = `<div id="dashboard-student" class="w-full flex main-view active"><aside class="w-72 bg-white border-r border-slate-200 flex-col p-4 flex-shrink-0 hidden md:flex"></aside><main id="student-content-area" class="flex-grow p-4 sm:p-6 md:p-8 overflow-y-auto bg-slate-50"></main></div>`;
            document.getElementById('role-content-wrapper').innerHTML = studentHTML;
            console.log("LOGIN: Calling initStudentDashboard()..."); // ADD THIS
            initStudentDashboard();
        }
        document.getElementById('logout-btn').addEventListener('click', logout);
        document.getElementById('ai-assistant-btn').addEventListener('click', showAiAssistant);
        document.getElementById('app-container').classList.remove('hidden');
        console.log(`--- LOGIN_END: Role=${role} ---`); // ADD THIS
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
        nav.querySelector('#media-library-btn').addEventListener('click', () => {
            const modal = document.getElementById('media-library-modal');
            if (modal) {
                modal.classList.remove('hidden');
                const currentCourseId = 'default-course'; // Placeholder

                // Initialize drag-and-drop functionality
                initializeCourseMediaUpload(currentCourseId);

                // Fetch and display existing files
                renderMediaLibraryFiles(currentCourseId);

                // Add listener for the close button inside the modal
                const closeBtn = document.getElementById('close-media-library-btn');
                if(closeBtn) {
                    // Use once: true to avoid adding multiple listeners if the modal is opened again
                    closeBtn.addEventListener('click', () => modal.classList.add('hidden'), { once: true });
                }
            }
        });
        // The querySelector for the interactions button
        const interactionsButton = nav.querySelector('[data-view="interactions"]');
        if (interactionsButton) {
            interactionsButton.addEventListener('click', (e) => {
                e.preventDefault();
                // Assumes a single course context for now, as per the prompt
                const currentCourseId = 'default-course'; // Placeholder
                renderTelegramInteractionView(currentCourseId);
            });
        }
        nav.querySelector('[data-view="analytics"]').addEventListener('click', (e) => {
            e.preventDefault();
            showProfessorContent('analytics');
        });
    }

    async function showProfessorContent(view, lesson = null) {
        const telegramView = document.getElementById('telegram-interaction-view');
        const dashboardView = document.getElementById('dashboard-professor');
        const analysisView = document.getElementById('student-analysis-view');
        const roleContentWrapper = document.getElementById('role-content-wrapper');

        // Hide all major views first
        if (telegramView) telegramView.classList.add('hidden');
        if (dashboardView) dashboardView.classList.add('hidden');
        if (analysisView) analysisView.classList.add('hidden');
        if (roleContentWrapper) roleContentWrapper.classList.remove('hidden');


        const sidebar = document.getElementById('professor-sidebar');
        const mainArea = document.getElementById('main-content-area');

        if (view === 'timeline' || view === 'editor') {
            if (dashboardView) dashboardView.classList.remove('hidden');
            mainArea.innerHTML = '';
            sidebar.innerHTML = '';
            mainArea.className = 'flex-grow bg-slate-100 flex flex-col h-screen view-transition';
        }

        if (view === 'timeline') {
            await fetchLessons();
            renderLessonLibrary(sidebar);
            renderTimeline(mainArea);
        } else if (view === 'editor') {
            currentLesson = lesson;
            renderEditorMenu(sidebar);
            showEditorContent(lesson ? 'docs' : 'details');
        } else if (view === 'interactions') {
            // This case is handled by a separate function `renderTelegramInteractionView`
            // which will hide the dashboard and show the telegram view.
        } else if (view === 'analytics') {
            if (analysisView) analysisView.classList.remove('hidden');
            if (dashboardView) dashboardView.classList.add('hidden'); // Ensure dashboard is hidden
             if (telegramView) telegramView.classList.add('hidden'); // Ensure telegram is hidden
            renderAnalytics(); // No longer passes mainArea
        }
    }

    function renderLessonLibrary(container) {
        container.innerHTML = `
            <header class="p-4 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
                <h2 class="text-xl font-bold text-slate-800">Knihovna lekcí</h2>
                <div class="flex items-center space-x-2">
                    <button id="create-new-lesson-btn" class="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800 transition transform hover:scale-105">+ Nová lekce</button>
                </div>
            </header>
            <div class="flex-grow overflow-y-auto p-2">
                <div id="lesson-library-list"></div>
            </div>`;

        const listEl = container.querySelector('#lesson-library-list');
        const statuses = [
            { name: 'Naplánováno', id: 'lessons-scheduled' },
            { name: 'Aktivní', id: 'lessons-active' },
            { name: 'Archivováno', id: 'lessons-archived' }
        ];

        lessonsData.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

        listEl.innerHTML = statuses.map(statusInfo => `
            <div class="p-2">
                <h3 class="px-2 text-sm font-semibold text-slate-500 mb-2">${statusInfo.name}</h3>
                <div id="${statusInfo.id}" class="lesson-group min-h-[100px] p-2 bg-slate-50 rounded-lg border border-dashed border-slate-200" data-status="${statusInfo.name}">
                ${lessonsData.filter(l => l.status === statusInfo.name).map(lesson => `
                    <div class="lesson-bubble-in-library p-3 mb-2 rounded-lg flex items-center justify-between bg-white border border-slate-200 hover:shadow-md hover:border-green-500 transition-all" data-id="${lesson.id}">
                        <div class="flex items-center space-x-3 cursor-pointer flex-grow" draggable="true">
                            <span class="text-2xl">${lesson.icon}</span>
                            <div>
                                <span class="font-semibold text-sm text-slate-700">${lesson.title}</span>
                                <p class="text-xs text-slate-500">${lesson.subtitle}</p>
                            </div>
                        </div>
                        <button class="delete-lesson-btn p-2 rounded-full hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors" data-id="${lesson.id}" title="Smazat lekci">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                `).join('') || `<p class="px-2 text-xs text-slate-400 italic">Žádné lekce v tomto stavu.</p>`}
                </div>
            </div>
        `).join('');
        
        container.querySelector('#create-new-lesson-btn').addEventListener('click', () => showProfessorContent('editor', null));
        container.querySelectorAll('.lesson-bubble-in-library').forEach(el => {
            const draggablePart = el.querySelector('[draggable="true"]');

            // Attach click listener to the content part for editing
            draggablePart.addEventListener('click', () => {
                const lesson = lessonsData.find(l => l.id == el.dataset.id);
                showProfessorContent('editor', lesson);
            });

            // Attach listener for the delete button
            const deleteBtn = el.querySelector('.delete-lesson-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent the edit listener from firing
                    const lessonId = e.currentTarget.dataset.id;
                    handleDeleteLesson(lessonId);
                });
            }

            // Attach drag-and-drop listeners for timeline
            draggablePart.addEventListener('dragstart', (e) => {
                e.currentTarget.closest('.lesson-bubble-in-library').classList.add('dragging');
                e.dataTransfer.setData('lesson_id', el.dataset.id);
            });
            draggablePart.addEventListener('dragend', (e) => {
                e.currentTarget.closest('.lesson-bubble-in-library').classList.remove('dragging');
            });
        });

        // Initialize Sortable.js for each lesson group in the library
        container.querySelectorAll('.lesson-group').forEach(groupEl => {
            new Sortable(groupEl, {
                group: {
                    name: 'lesson-status',
                    pull: function (to, from) {
                        const toGroupName = to.options.group.name;
                        const fromGroupEl = from.el;

                        // When dragging to the timeline for scheduling
                        if (toGroupName === 'timeline-events') {
                            // Only allow CLONING from the 'Aktivní' column.
                            // Disallow dragging from any other status column to the timeline.
                            return fromGroupEl.id === 'lessons-active' ? 'clone' : false;
                        }

                        // When dragging between status columns, allow MOVE.
                        return true;
                    },
                    put: true // Allow dropping into any status column to change status
                },
                animation: 150,
                sort: true,
                ghostClass: 'blue-background-class',
                onAdd: async function (evt) {
                    const itemEl = evt.item;
                    const lessonId = itemEl.dataset.id;
                    const toContainer = evt.to;
                    const newStatus = toContainer.dataset.status;

                    if (!lessonId || !newStatus) {
                        console.error("Could not find lesson ID or new status on drop.");
                        return;
                    }

                    const lessonRef = doc(db, 'lessons', lessonId);
                    try {
                        await updateDoc(lessonRef, { status: newStatus });
                        console.log(`Lesson ${lessonId} status updated to ${newStatus}`);

                        const lessonInData = lessonsData.find(l => l.id === lessonId);
                        if (lessonInData) {
                            lessonInData.status = newStatus;
                        }

                        // Re-render the entire library to fix "dead" lessons.
                        const sidebar = document.getElementById('professor-sidebar');
                        if (sidebar) {
                            renderLessonLibrary(sidebar);
                        }

                    } catch (error) {
                        console.error("Error updating lesson status:", error);
                        evt.from.appendChild(itemEl);
                        alert("Došlo k chybě při změně stavu lekce.");
                    }
                }
            });
        });
    }
    
    async function renderTimeline(container) {
        container.innerHTML = `
            <header class="text-center p-6 border-b border-slate-200 bg-white">
                <h1 class="text-3xl font-extrabold text-slate-800">Plán výuky</h1>
                <p class="text-slate-500 mt-1">Naplánujte lekce přetažením z knihovny vlevo.</p>
            </header>
            <div class="flex-grow overflow-y-auto p-4 md:p-6">
                <div id="timeline-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"></div>
            </div>`;

        const timelineContainer = container.querySelector('#timeline-container');
        const startDate = new Date('2025-10-01T12:00:00Z'); // Consistent start date
        const courseId = 'default-course'; // Placeholder

        // 1. Fetch all timeline events for the course
        const eventsCollection = collection(db, 'timeline_events');
        const q = query(eventsCollection, where("courseId", "==", courseId));
        const querySnapshot = await getDocs(q);
        const timelineEvents = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 2. Create the day slots
        for (let i = 0; i < 10; i++) {
            const dayDate = new Date(startDate);
            dayDate.setDate(startDate.getDate() + i);
            const dateString = dayDate.toISOString().split('T')[0]; // YYYY-MM-DD

            const dayWrapper = document.createElement('div');
            dayWrapper.className = 'day-slot bg-white rounded-xl p-3 border-2 border-transparent transition-colors min-h-[250px] shadow-sm flex flex-col';
            
            const formattedDate = dayDate.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' });
            dayWrapper.innerHTML = `<div class="text-center pb-2 mb-2 border-b border-slate-200"><p class="font-bold text-slate-700">${formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1)}</p></div><div class="lessons-container flex-grow" data-date="${dateString}"></div>`;
            
            timelineContainer.appendChild(dayWrapper);
        }

        // 3. Populate the day slots with events
        timelineEvents.forEach(event => {
            const lesson = lessonsData.find(l => l.id === event.lessonId);
            if (lesson) {
                const container = timelineContainer.querySelector(`.lessons-container[data-date="${event.scheduledDate}"]`);
                if (container) {
                    const lessonEl = createTimelineLessonElement(lesson, event.id);
                    // Insert in correct order
                    const existingLessons = Array.from(container.children);
                    const insertBefore = existingLessons.find(el => parseInt(el.dataset.orderIndex) > event.orderIndex);
                    if (insertBefore) {
                        container.insertBefore(lessonEl, insertBefore);
                    } else {
                        container.appendChild(lessonEl);
                    }
                }
            }
        });

        // 4. Initialize SortableJS for all timeline containers
        initializeTimelineSortable();
    }

    function createTimelineLessonElement(lesson, eventId) {
        const el = document.createElement('div');
        el.className = 'lesson-bubble bg-green-100 text-green-800 p-3 m-1 rounded-lg shadow-sm flex items-center justify-between border border-green-200';
        el.dataset.lessonId = lesson.id; // The original lesson ID
        el.dataset.eventId = eventId;   // The ID of the document in timeline_events

        el.innerHTML = `
            <div class="flex items-center space-x-3 flex-grow">
                <span class="text-xl">${lesson.icon}</span>
                <span class="font-semibold text-sm">${lesson.title}</span>
            </div>
            <button class="delete-event-btn p-1 rounded-full hover:bg-red-200 text-slate-400 hover:text-red-600 transition-colors" title="Odebrat z plánu">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>`;
        
        // Add listener for the delete button on the event bubble
        el.querySelector('.delete-event-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            const eventIdToDelete = el.dataset.eventId;
            if (confirm('Opravdu chcete odebrat tuto lekci z plánu?')) {
                try {
                    await deleteDoc(doc(db, 'timeline_events', eventIdToDelete));
                    el.remove(); // Remove from DOM
                    // Note: Re-ordering other items is not strictly necessary but could be done
                } catch (error) {
                    console.error("Error deleting timeline event:", error);
                    alert("Chyba při odstraňování události.");
                }
            }
        });

        return el;
    }
    
    function initializeTimelineSortable() {
        const containers = document.querySelectorAll('#timeline-container .lessons-container');

        const updateFirestoreOrder = async (container) => {
            const batch = writeBatch(db);
            const children = Array.from(container.children);
            for (let i = 0; i < children.length; i++) {
                const eventId = children[i].dataset.eventId;
                if (eventId) {
                    const eventRef = doc(db, 'timeline_events', eventId);
                    batch.update(eventRef, { orderIndex: i });
                }
            }
            try {
                await batch.commit();
            } catch (error) {
                console.error("Failed to update order in Firestore:", error);
            }
        };

        containers.forEach(container => {
            new Sortable(container, {
                group: {
                    name: 'timeline-events',
                    put: ['lesson-status']
                },
                animation: 150,
                ghostClass: 'blue-background-class',
                dragClass: 'dragging',
                onAdd: async function (evt) {
                    const itemEl = evt.item;
                    const fromContainer = evt.from;
                    const toContainer = evt.to;
                    const scheduledDate = toContainer.dataset.date;

                    // CASE 1: A lesson is CLONED from the library to the timeline
                    if (fromContainer.classList.contains('lesson-group')) {
                        const lessonId = itemEl.dataset.id; // Correctly get lessonId from data-id
                        itemEl.remove(); // Remove the clone, we'll create a real one.

                        if (!lessonId || !scheduledDate) {
                            console.error("Missing lessonId or scheduledDate for timeline event creation.");
                            return;
                        }
                        try {
                            await addDoc(collection(db, 'timeline_events'), {
                                lessonId: lessonId,
                                courseId: 'default-course',
                                scheduledDate: scheduledDate,
                                orderIndex: evt.newDraggableIndex,
                                createdAt: serverTimestamp()
                            });
                            // Re-render everything to ensure UI is consistent and interactive
                            const mainArea = document.getElementById('main-content-area');
                            const sidebar = document.getElementById('professor-sidebar');
                            await renderTimeline(mainArea);
                            renderLessonLibrary(sidebar); // This is the crucial fix for "dead" lessons after cloning
                        } catch (error) {
                            console.error("Error creating new timeline event:", error);
                        }
                    }
                    // CASE 2: An existing timeline event is MOVED from one day to another
                    else if (itemEl.dataset.eventId) {
                        const eventId = itemEl.dataset.eventId;
                        await updateDoc(doc(db, 'timeline_events', eventId), {
                             scheduledDate: scheduledDate
                        });
                        // Update order in both lists
                        await updateFirestoreOrder(fromContainer);
                        await updateFirestoreOrder(toContainer);
                    }
                },
                onUpdate: function (evt) {
                    updateFirestoreOrder(evt.from);
                }
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
        
        // Step 1: Generate the HTML string for the view
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

                        <div class="text-right pt-4"><button id="save-lesson-btn" class="px-6 py-2 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition transform hover:scale-105">Uložit změny</button></div>
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

        // Step 2: Render the HTML to the DOM
        container.innerHTML = contentHTML;

        // Step 3: Execute JS logic that depends on the now-rendered DOM
        if (viewId === 'details') {
            document.getElementById('save-lesson-btn').addEventListener('click', handleSaveLesson);
        }

        if (viewId === 'docs') {
             setTimeout(() => {
                if (typeof initializeUpload === 'function') {
                    initializeUpload(currentLesson);
                }
            }, 0);
        }
        
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
            // This listener setup can be generalized for all generator views
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
                    // This switch is now only for the API call logic
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

    async function handleSaveLesson() {
        const form = document.getElementById('lesson-details-form');
        const titleInput = form.querySelector('input[placeholder="Např. Úvod do organické chemie"]');
        const subtitleInput = form.querySelector('input[placeholder="Základní pojmy a principy"]');
        const numberInput = form.querySelector('input[placeholder="Např. 101"]');

        const title = titleInput.value;
        const subtitle = subtitleInput.value;
        const number = numberInput.value;

        if (!title || !subtitle || !number) {
            alert('Vyplňte prosím všechna pole.');
            return;
        }

        const lessonData = {
            title,
            subtitle,
            number,
            status: currentLesson?.status || 'Naplánováno', // Default status for new lessons
            icon: currentLesson?.icon || '🆕',
            content: currentLesson?.content || 'Tato lekce zatím nemá žádný obsah.',
        };

        try {
            if (currentLesson && currentLesson.id) {
                // Update existing lesson
                const lessonRef = doc(db, 'lessons', currentLesson.id);
                await updateDoc(lessonRef, lessonData);
                alert('Lekce byla úspěšně aktualizována.');
            } else {
                // Create new lesson
                await addDoc(lessonsCollection, {
                    ...lessonData,
                    creationDate: new Date().toISOString().split('T')[0], // Set creation date
                    createdAt: serverTimestamp() // For ordering
                });
                alert('Lekce byla úspěšně vytvořena.');
            }
            await login(currentUserRole); // Re-login to refresh all data and UI
        } catch (error) {
            console.error("Chyba při ukládání lekce: ", error);
            alert("Při ukládání lekce došlo k chybě.");
        }
    }

    async function handleDeleteLesson(lessonId) {
        if (confirm('Opravdu chcete smazat tuto lekci? Tato akce je nevratná.')) {
            try {
                const lessonRef = doc(db, 'lessons', lessonId);
                await deleteDoc(lessonRef);
                alert('Lekce byla úspěšně smazána.');
                await login(currentUserRole); // Re-login to refresh all data and UI
            } catch (error) {
                console.error("Chyba při mazání lekce: ", error);
                alert("Při mazání lekce došlo k chybě.");
            }
        }
    }
    
    // --- LOGIKA PRO STUDENTA ---
    function setupStudentNav() {
        const nav = document.getElementById('main-nav');
        // Student nav is simple, just one button for their main dashboard view.
        nav.innerHTML = `<li><button class="nav-item p-3 rounded-lg flex items-center justify-center text-white bg-green-600" title="Moje studium"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></button></li>`;
    }

    async function initStudentDashboard() {
        console.log("--- INIT_STUDENT_DASHBOARD_START ---"); // ADD THIS

        try { // ADD THIS 'try'
            const mainContent = document.getElementById('student-content-area');
            const sidebar = document.querySelector('#dashboard-student aside');

            console.log("INIT_STUDENT: Checking for main elements..."); // ADD THIS
            if (!mainContent || !sidebar) {
                console.error("CRITICAL_ERROR: Student dashboard elements not found. Cannot initialize.");
                return;
            }
            if (!lessonsData || lessonsData.length === 0) {
                console.warn("initStudentDashboard called but lessonsData is empty. Displaying fallback message.");
                mainContent.innerHTML = `<div class="p-8 text-center text-slate-500">Pro vás zatím nebyly připraveny žádné lekce.</div>`;
                return; // Stop further execution
            }
            // Use the new top-level container for student content
            const studentContentArea = document.getElementById('student-content-area');
            if (!studentContentArea) {
                console.error("Student content area not found. Cannot initialize.");
                return;
            }

            // Show a loading state inside the lesson container part
            const studentDashboardContent = document.getElementById('student-dashboard-content');
            if (studentDashboardContent) {
                studentDashboardContent.innerHTML = `<div class="p-8 text-center pulse-loader text-slate-500">Načítání...</div>`;
            }


            // --- Part B: Implement the Display Logic for Telegram ---
            console.log("INIT_STUDENT: Fetching student-specific data...");
            const user = auth.currentUser;
            const telegramConnectionBox = document.getElementById('telegram-connection-box');
            const telegramLinkContainer = document.getElementById('telegram-link-container');

            if (user && telegramConnectionBox && telegramLinkContainer) {
                try {
                    const studentDocRef = doc(db, "students", user.uid);
                    const studentDoc = await getDoc(studentDocRef);

                    if (studentDoc.exists()) {
                        const studentData = studentDoc.data();

                        // If telegramChatId exists, the student is connected. Hide the box.
                        if (studentData.telegramChatId) {
                            telegramConnectionBox.style.display = 'none';
                        } else {
                            // Otherwise, ensure the box is visible and populate the link.
                            telegramConnectionBox.style.display = 'flex';
                            const token = studentData.telegramConnectionToken;
                            const botUsername = 'ai_sensei_czu_bot'; // Placeholder

                            if (token) {
                                const connectionLink = `https://t.me/${botUsername}?start=${token}`;
                                telegramLinkContainer.innerHTML = `
                                <a href="${connectionLink}" target="_blank" rel="noopener noreferrer" class="inline-block bg-sky-500 text-white font-bold py-2 px-4 rounded hover:bg-sky-600 transition-colors shadow">
                                    <i class="fa-brands fa-telegram mr-2"></i>Klikněte zde pro propojení
                                </a>
                                <p class="text-xs mt-2 text-sky-700">Tento odkaz je unikátní pro váš účet a je jednorázový.</p>
                            `;
                            } else {
                                telegramLinkContainer.innerHTML = '<p class="italic text-red-600">Nepodařilo se načíst váš unikátní propojovací kód. Zkuste prosím obnovit stránku.</p>';
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error fetching student data for Telegram connection:", error);
                    telegramConnectionBox.style.display = 'flex';
                    telegramLinkContainer.innerHTML = `<p class="italic text-red-600">Došlo k chybě při kontrole stavu propojení: ${error.message}</p>`;
                }
            }

            // --- Render Lessons into the dashboard content area ---

            const sortedLessons = [...lessonsData].sort((a, b) => new Date(b.creationDate) - new Date(a.creationDate));

            const lessonsHtml = sortedLessons.map(lesson => {
                return `
                <div class="bg-white rounded-2xl shadow-lg overflow-hidden mb-6 hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer student-lesson-card" data-lesson-id="${lesson.id}">
                    <div class="p-6">
                        <div class="flex items-start justify-between">
                            <div>
                                <p class="text-sm font-semibold text-green-600">${lesson.number}</p>
                                <h2 class="text-2xl font-bold text-slate-800 mt-1 pointer-events-none">${lesson.title}</h2>
                                <p class="text-slate-500 pointer-events-none">${lesson.subtitle}</p>
                            </div>
                            <span class="text-4xl pointer-events-none">${lesson.icon}</span>
                        </div>
                        <div class="mt-4 pt-4 border-t border-slate-200 prose prose-sm max-w-none text-slate-600 pointer-events-none">
                            ${lesson.content}
                        </div>
                    </div>
                </div>
            `;
            }).join('');

            if (studentDashboardContent) {
                studentDashboardContent.innerHTML = `
                <h1 class="text-3xl font-extrabold text-slate-800 mb-6">Váš přehled</h1>
                <h2 class="text-2xl font-bold text-slate-800 mb-4">Dostupné lekce</h2>
                ${lessonsHtml}
            `;
            }

            // To prevent adding multiple listeners if this function is called again,
            // we clone the node, replace it, and add the listener to the new node.
            const newStudentContentArea = studentContentArea.cloneNode(true);
            studentContentArea.parentNode.replaceChild(newStudentContentArea, studentContentArea);

            newStudentContentArea.addEventListener('click', async (e) => {
                const lessonCard = e.target.closest('.student-lesson-card');
                if (lessonCard) {
                    const lessonId = lessonCard.dataset.lessonId;
                    const lesson = lessonsData.find(l => l.id === lessonId);
                    if (lesson) {
                        showStudentLesson(lesson);
                    }
                }
            });
            console.log("--- INIT_STUDENT_DASHBOARD_SUCCESS ---"); // ADD THIS AT THE END OF THE 'try' block

        } catch (error) { // ADD THIS 'catch' block
            console.error("!!!!!!!!!!!!!!!!! CRASH DETECTED IN initStudentDashboard !!!!!!!!!!!!!!!!!");
            console.error("THE ERROR IS:", error);
            console.error("Stack Trace:", error.stack);
            document.body.innerHTML = `<div style="padding: 2rem; color: red; font-family: monospace;">
            <h1>Application Crashed</h1>
            <p>Error in initStudentDashboard:</p>
            <pre>${error.stack}</pre>
        </div>`;
        }
    }

async function showStudentLesson(lessonData) { // Accept the full lesson object
    const mainAppView = document.getElementById('app-container');
    const lessonView = document.getElementById('student-lesson-view');
    const aiAssistantBtn = document.getElementById('ai-assistant-btn');

    if (!mainAppView || !lessonView || !lessonData) {
        console.error("Missing critical elements or lesson data for rendering the lesson view.");
        return;
    }

    const lessonId = lessonData.id; // Still need the ID for some operations like chat
    const visitedTabs = new Set();
    let totalTabs = 3; // Start with the core tabs (Text, Takeaways, Assistant, Chat)

    // --- Hide main view, show lesson view ---
    mainAppView.classList.add('hidden');
    if (aiAssistantBtn) aiAssistantBtn.style.display = 'none'; // Use inline style to hide consistently
    lessonView.classList.remove('hidden');
    lessonView.classList.add('view-transition');

    // --- Element References ---
    const titleEl = lessonView.querySelector('#student-lesson-title');
    const progressBar = lessonView.querySelector('#lesson-progress-bar');
    const tabNav = lessonView.querySelector('nav');
    const contentContainer = lessonView.querySelector('#student-lesson-content-container');

    // User info display
    const user = auth.currentUser;
    if (user) {
        lessonView.querySelector('#student-email-display').textContent = user.email;
        lessonView.querySelector('#student-avatar').textContent = user.email.charAt(0).toUpperCase();
    }

    // --- Reset to default state before populating ---
    // This prevents stale data from a previously opened lesson from showing
    titleEl.textContent = 'Načítání...';
    progressBar.style.width = '0%';
    contentContainer.querySelector('#lesson-text-content').innerHTML = '<div class="p-8 text-center pulse-loader text-slate-500">Načítání...</div>';
    contentContainer.querySelector('#takeaways-result').innerHTML = '';
    contentContainer.querySelector('#ai-assistant-chat-history').innerHTML = `
         <div class="flex gap-3 items-start">
            <div class="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-robot"></i></div>
            <div class="bg-slate-100 p-3 rounded-lg rounded-tl-none">
                <p class="text-slate-700">Ahoj! Na co se chcete zeptat k této lekci?</p>
            </div>
        </div>`;

    // --- Progress Bar Logic ---
    const updateProgressBar = () => {
        const progress = Math.min((visitedTabs.size / totalTabs) * 100, 100);
        progressBar.style.width = `${progress}%`;
    };

    // --- Tab Switching Logic (with listener cleanup) ---
    const newTabNav = tabNav.cloneNode(true);
    tabNav.parentNode.replaceChild(newTabNav, tabNav);
    newTabNav.addEventListener('click', (e) => {
        const button = e.target.closest('.student-lesson-tab-btn');
        if (!button) return;

        const tabId = button.dataset.tab;

        // Update button styles
        newTabNav.querySelectorAll('.student-lesson-tab-btn').forEach(btn => {
            btn.classList.remove('bg-green-100', 'text-green-800');
            btn.classList.add('text-slate-600', 'hover:bg-slate-100');
        });
        button.classList.add('bg-green-100', 'text-green-800');
        button.classList.remove('text-slate-600', 'hover:bg-slate-100');

        // Show the correct pane
        contentContainer.querySelectorAll('.student-lesson-tab-pane').forEach(pane => {
            pane.classList.add('hidden');
        });
        contentContainer.querySelector(`#tab-${tabId}`).classList.remove('hidden');

        // Update progress
        if (!visitedTabs.has(tabId)) {
            visitedTabs.add(tabId);
            updateProgressBar();
        }
    });

    // --- Populate Data (No Fetch Needed) ---
    try {
        titleEl.textContent = lessonData.title;

        // --- Populate Core Content ---
        contentContainer.querySelector('#lesson-text-content').innerHTML = lessonData.content ? lessonData.content.replace(/\n/g, '<br>') : '<p>Pro tuto lekci není k dispozici žádný text.</p>';

        const videoTabBtn = tabNav.querySelector('[data-tab="video"]');
        if (lessonData.videoUrl) {
            const videoId = lessonData.videoUrl.split('v=')[1]?.split('&')[0];
            contentContainer.querySelector('#lesson-video-content').innerHTML = videoId ? `<iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen class="w-full h-full"></iframe>` : '<p class="text-white">Neplatná adresa videa.</p>';
            videoTabBtn.style.display = 'flex';
            totalTabs++;
        } else {
            videoTabBtn.style.display = 'none';
        }

        const extraTabBtn = tabNav.querySelector('[data-tab="extra"]');
        let extraHtml = '';
        if (lessonData.podcastUrl) {
            extraHtml += `<h3 class="font-bold text-lg mb-2">Doporučený Podcast</h3><iframe style="border-radius:12px" src="${lessonData.podcastUrl}" width="100%" height="152" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
        }
        if (lessonData.quizUrl) {
            extraHtml += `<h3 class="font-bold text-lg mt-6 mb-2">Doplňkový Kvíz</h3><a href="${lessonData.quizUrl}" target="_blank" class="text-green-600 hover:underline">Otevřít kvíz v nové záložce &rarr;</a>`;
        }
        contentContainer.querySelector('#lesson-extra-content').innerHTML = extraHtml || '<p>Pro tuto lekci nejsou k dispozici žádné doplňkové materiály.</p>';
        if (extraHtml) {
            extraTabBtn.style.display = 'flex';
            totalTabs++;
        } else {
            extraTabBtn.style.display = 'none';
        }

        // --- Initialize Interactive Features ---
        // These functions are defined below and capture the current lessonData in their scope.
        initializeKeyTakeaways();
        initializeAiAssistant();
        initializeProfessorChat();

        // Set initial progress
        visitedTabs.add('text');
        updateProgressBar();

    } catch (error) {
        console.error("Error populating student lesson view:", error);
        titleEl.textContent = 'Chyba';
        contentContainer.querySelector('#lesson-text-content').innerHTML = `<p>${error.message}</p>`;
    }

    // --- Feature Initializers (as nested functions to capture scope) ---
    function initializeKeyTakeaways() {
        const generateBtn = contentContainer.querySelector('#generate-takeaways-btn');
        const resultContainer = contentContainer.querySelector('#takeaways-result');
        const clickHandler = async () => {
            generateBtn.disabled = true;
            generateBtn.innerHTML = `<div class="spinner"></div><span class="ml-2">Generuji...</span>`;
            resultContainer.innerHTML = '';
            try {
                const result = await getLessonKeyTakeaways({ lessonText: lessonData.content });
                resultContainer.innerHTML = `<div class="bg-yellow-50 border border-yellow-200 p-6 rounded-lg">${result.data.takeaways.replace(/\n/g, '<br>')}</div>`;
            } catch (e) {
                resultContainer.innerHTML = `<p class="text-red-500">Nepodařilo se vygenerovat klíčové body: ${e.message}</p>`;
            } finally {
                generateBtn.disabled = false;
                generateBtn.innerHTML = `<i class="fas fa-wand-magic-sparkles mr-2"></i>Vygenerovat znovu`;
            }
        };
        generateBtn.replaceWith(generateBtn.cloneNode(true)); // Remove old listeners
        contentContainer.querySelector('#generate-takeaways-btn').addEventListener('click', clickHandler);
    }

    function initializeAiAssistant() {
        const sendBtn = contentContainer.querySelector('#ai-assistant-send-btn');
        const input = contentContainer.querySelector('#ai-assistant-input');
        const historyContainer = contentContainer.querySelector('#ai-assistant-chat-history');

        const addMessageToHistory = (text, sender) => {
            const bubble = document.createElement('div');
            if (sender === 'user') {
                bubble.className = 'flex gap-3 items-start justify-end';
                bubble.innerHTML = `<div class="bg-green-600 text-white p-3 rounded-lg rounded-br-none"><p>${text}</p></div><div class="w-8 h-8 bg-blue-200 text-blue-800 rounded-full flex items-center justify-center flex-shrink-0 font-bold">${user.email.charAt(0).toUpperCase()}</div>`;
            } else {
                bubble.className = 'flex gap-3 items-start';
                bubble.innerHTML = `<div class="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-robot"></i></div><div class="bg-slate-100 p-3 rounded-lg rounded-tl-none ai-response"><p class="text-slate-700">${text}</p></div>`;
            }
            historyContainer.appendChild(bubble);
            historyContainer.scrollTop = historyContainer.scrollHeight;
            return bubble;
        };

        const handleSend = async () => {
            const question = input.value.trim();
            if (!question) return;
            addMessageToHistory(question, 'user');
            input.value = '';
            input.disabled = true;
            sendBtn.disabled = true;
            const typingBubble = addMessageToHistory('<div class="typing-indicator"><span></span><span></span><span></span></div>', 'ai');
            try {
                const result = await getAiAssistantResponse({ lessonText: lessonData.content, userQuestion: question });
                typingBubble.querySelector('.ai-response p').innerHTML = result.data.answer.replace(/\n/g, '<br>');
            } catch (e) {
                typingBubble.querySelector('.ai-response p').innerHTML = `<span class="text-red-500">Omlouvám se, došlo k chybě: ${e.message}</span>`;
            } finally {
                input.disabled = false;
                sendBtn.disabled = false;
                input.focus();
            }
        };
        sendBtn.replaceWith(sendBtn.cloneNode(true));
        contentContainer.querySelector('#ai-assistant-send-btn').addEventListener('click', handleSend);
        input.replaceWith(input.cloneNode(true));
        contentContainer.querySelector('#ai-assistant-input').addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } });
    }

    function initializeProfessorChat() {
        const chatInput = contentContainer.querySelector('#student-chat-input');
        const sendBtn = contentContainer.querySelector('#student-send-message-btn');
        const chatHistoryArea = contentContainer.querySelector('#chat-history-area');

        const handleSendMessage = async () => {
            const text = chatInput.value.trim();
            if (!text) return;
            const userBubble = document.createElement('div');
            userBubble.className = 'chat-bubble chat-bubble-user';
            userBubble.textContent = text;
            chatHistoryArea.appendChild(userBubble);
            chatHistoryArea.scrollTop = chatHistoryArea.scrollHeight;
            const originalButtonContent = sendBtn.innerHTML;
            sendBtn.innerHTML = `<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>`;
            chatInput.value = '';
            chatInput.disabled = true;
            sendBtn.disabled = true;
            try {
                await sendMessageToProfessor({ lessonId, text });
            } catch (error) {
                console.error("Error sending message to professor:", error);
                userBubble.style.outline = '2px solid red';
                alert(`Chyba při odesílání: ${error.message}`);
            } finally {
                chatInput.disabled = false;
                sendBtn.disabled = false;
                sendBtn.innerHTML = originalButtonContent;
                chatInput.focus();
            }
        };
        sendBtn.replaceWith(sendBtn.cloneNode(true));
        contentContainer.querySelector('#student-send-message-btn').addEventListener('click', handleSendMessage);
        chatInput.replaceWith(chatInput.cloneNode(true));
        contentContainer.querySelector('#student-chat-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleSendMessage(); } });
    }

    // --- Back Button Logic ---
    const backBtn = lessonView.querySelector('#back-to-student-dashboard-btn');
    backBtn.addEventListener('click', () => {
        lessonView.classList.add('hidden');
        mainAppView.classList.remove('hidden');
        if (aiAssistantBtn) aiAssistantBtn.style.display = 'flex'; // Use inline style
        initStudentDashboard();
    }, { once: true });
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


    async function renderTelegramInteractionView(courseId) {
        // Hide the main dashboard and show the Telegram view
        const dashboardView = document.getElementById('dashboard-professor');
        const telegramView = document.getElementById('telegram-interaction-view');
        const studentListContainer = document.getElementById('student-telegram-list');
        const roleContentWrapper = document.getElementById('role-content-wrapper');

        if (dashboardView) dashboardView.classList.add('hidden');
        if (roleContentWrapper) roleContentWrapper.classList.add('hidden');
        if (telegramView) {
            telegramView.classList.remove('hidden');
            telegramView.style.backgroundColor = '#1f2937'; // bg-gray-800
            telegramView.style.height = '100%';
            telegramView.style.flexGrow = '1';
        }

        studentListContainer.innerHTML = '<p class="text-white">Načítám studenty...</p>';

        try {
            // In a real app, you might query based on courseId.
            // For now, we fetch all students as per the prompt's example.
            const studentsSnapshot = await getDocs(collection(db, 'students'));

            studentListContainer.innerHTML = ''; // Clear loading message

            if (studentsSnapshot.empty) {
                studentListContainer.innerHTML = '<p class="text-white">Nebyly nalezeni žádní studenti.</p>';
                return;
            }

            const sendMessageToStudent = httpsCallable(functions, 'sendMessageToStudent');

            studentsSnapshot.forEach(doc => {
                const student = doc.data();
                const studentId = doc.id;

                // Create the UI element for each student
                const studentEl = document.createElement('div');
                studentEl.className = 'bg-gray-800 p-4 rounded-lg flex flex-col md:flex-row items-center justify-between';
                studentEl.innerHTML = `
                    <span class="text-white font-medium mb-2 md:mb-0">${student.email || studentId}</span>
                    <div class="w-full md:w-3/4 flex items-center space-x-2">
                        <textarea class="w-full bg-gray-700 text-white rounded-md p-2" rows="1" placeholder="Napište zprávu..."></textarea>
                        <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Odeslat</button>
                    </div>
                `;

                // Add send message functionality
                const sendButton = studentEl.querySelector('button');
                const textArea = studentEl.querySelector('textarea');
                sendButton.addEventListener('click', async () => {
                    const messageText = textArea.value;
                    if (!messageText.trim()) {
                        alert('Zpráva nemůže být prázdná.');
                        return;
                    }

                    sendButton.textContent = 'Odesílám...';
                    sendButton.disabled = true;

                    try {
                        await sendMessageToStudent({ studentId: studentId, text: messageText });
                        textArea.value = '';
                        alert('Zpráva úspěšně odeslána!');
                    } catch (error) {
                        console.error('Error sending message:', error);
                        alert('Nepodařilo se odeslat zprávu: ' + error.message);
                    } finally {
                        sendButton.textContent = 'Odeslat';
                        sendButton.disabled = false;
                    }
                });

                studentListContainer.appendChild(studentEl);
            });

        } catch (error) {
            console.error("Error fetching students: ", error);
            studentListContainer.innerHTML = '<p class="text-red-500">Chyba při načítání studentů.</p>';
        }
    }

    async function renderAnalytics() {
        const studentListContainer = document.getElementById('analysis-student-list');
        if (!studentListContainer) return;

        studentListContainer.innerHTML = '<p class="text-slate-500">Načítám studenty...</p>';

        try {
            const studentsSnapshot = await getDocs(collection(db, 'students'));

            if (studentsSnapshot.empty) {
                studentListContainer.innerHTML = '<p class="text-slate-500">Nebyly nalezeni žádní studenti.</p>';
                return;
            }

            studentListContainer.innerHTML = ''; // Clear loading message

            studentsSnapshot.forEach(studentDoc => {
                const student = studentDoc.data();
                const studentId = studentDoc.id;
                const studentEl = document.createElement('div');
                studentEl.className = 'p-4 border-b border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors';
                studentEl.textContent = student.email || studentId;
                studentEl.dataset.studentId = studentId; // Add data attribute
                studentListContainer.appendChild(studentEl);
            });

            // Add a single click listener to the list container
            studentListContainer.addEventListener('click', (e) => {
                const target = e.target.closest('[data-student-id]');
                if (target) {
                    const studentId = target.dataset.studentId;
                    showStudentDetail(studentId);
                }
            });

        } catch (error) {
            console.error("Error fetching students for analysis: ", error);
            studentListContainer.innerHTML = '<p class="text-red-500">Chyba při načítání studentů.</p>';
        }
    }

    async function showStudentDetail(studentId) {
        const appContainer = document.getElementById('app-container');
        const detailView = document.getElementById('student-detail-view');
        const aiAssistantBtn = document.getElementById('ai-assistant-btn');

        if (!appContainer || !detailView) return;

        // Hide the main app container and the floating button
        appContainer.classList.add('hidden');
        if (aiAssistantBtn) aiAssistantBtn.classList.add('hidden');

        // Show the detail view
        detailView.classList.remove('hidden');
        detailView.innerHTML = '<p class="text-slate-500 p-8">Načítám detail studenta...</p>';

        try {
            const studentRef = doc(db, 'students', studentId);
            const studentSnap = await getDoc(studentRef);

            if (!studentSnap.exists()) {
                detailView.innerHTML = '<p class="text-red-500 p-8">Student nebyl nalezen.</p>';
                return;
            }

            const student = studentSnap.data();
            const registrationDate = student.createdAt?.toDate() ? student.createdAt.toDate().toLocaleDateString('cs-CZ') : 'Neznámé';

            // The detail view now provides its own container styling, so we don't need the inner one.
            detailView.innerHTML = `
                <button id="back-to-student-list" class="flex items-center text-sm text-green-700 hover:underline mb-4">&larr; Zpět na seznam studentů</button>
                <div class="bg-white p-6 rounded-2xl shadow-lg">
                    <h2 class="text-3xl font-extrabold text-slate-800">${student.email}</h2>
                    <p class="text-slate-500 mt-1">Datum registrace: ${registrationDate}</p>

                    <div class="mt-6 border-t pt-6">
                        <h3 class="text-xl font-bold text-slate-800 mb-4">Analýza Aktivity (Fáze 2)</h3>
                        <p class="text-slate-500 mb-4">Tato sekce bude obsahovat detailní analýzu interakcí a pokroku studenta.</p>
                        <button id="ai-analysis-btn" class="bg-indigo-500 text-white font-semibold px-6 py-3 rounded-lg hover:bg-indigo-600 transition-colors">
                            Spustit AI Analýzu
                        </button>
                    </div>
                </div>
            `;

            document.getElementById('back-to-student-list').addEventListener('click', () => {
                detailView.classList.add('hidden');
                appContainer.classList.remove('hidden');
                if (aiAssistantBtn) aiAssistantBtn.classList.remove('hidden');
            });
        } catch (error) {
            console.error("Error fetching student detail:", error);
            detailView.innerHTML = '<p class.="text-red-500 p-8">Chyba při načítání detailu studenta.</p>';
        }
    }