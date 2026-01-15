import { db, auth } from '../firebase-init.js';
import { collection, addDoc, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getCollectionPath } from '../utils/utils.js';

export class DemoService {
    constructor() {
    }

    async initProfessorDemo() {
        const user = auth.currentUser;
        if (!user || !user.isAnonymous) return;

        console.log("Initializing Professor Demo...");

        // 1. Create a Class
        const groupsPath = getCollectionPath('groups');
        const classRef = await addDoc(collection(db, groupsPath), {
            name: "Dějepis 4.A",
            ownerId: user.uid,
            joinCode: "DEMO01",
            studentIds: [],
            createdAt: serverTimestamp()
        });

        // 2. Create Lessons
        const lessonsPath = getCollectionPath('lessons');

        // Lesson 1: Industrial Revolution (Published)
        await addDoc(collection(db, lessonsPath), {
            title: "Průmyslová revoluce",
            subtitle: "Pára, stroje a změna společnosti",
            topic: "Dějepis",
            ownerId: user.uid,
            isPublished: true,
            status: "published",
            createdAt: serverTimestamp(),
            assignedToGroups: [classRef.id],
            textContent: "Průmyslová revoluce představovala přechod od ruční výroby k strojní, což zásadně změnilo zemědělství, výrobu, těžbu, dopravu i technologie. Začala ve Velké Británii v 18. století."
        });

        // Lesson 2: Cold War (Draft)
        await addDoc(collection(db, lessonsPath), {
            title: "Studená válka",
            subtitle: "Svět rozdělený železnou oponou",
            topic: "Dějepis",
            ownerId: user.uid,
            isPublished: false,
            status: "draft",
            createdAt: serverTimestamp(),
            assignedToGroups: [],
            textContent: "Studená válka byl stav politického a vojenského napětí mezi západním blokem (USA) a východním blokem (SSSR) po druhé světové válce."
        });

        // Lesson 3: AI in Education (Showcase Features)
        const quizData = {
            questions: [
                {
                    question: "Co je to AI hallucionace?",
                    options: ["Když AI vidí duchy", "Když AI generuje přesvědčivá ale nepravdivá fakta", "Když se AI přehřeje", "Když AI sní"],
                    correctAnswer: 1,
                    explanation: "Halucinace je termín pro situaci, kdy jazykový model generuje text, který je gramaticky správný a logický, ale fakticky nesmyslný nebo nepravdivý."
                },
                {
                    question: "Který typ učení využívá odměny a tresty?",
                    options: ["Učení s učitelem", "Učení bez učitele", "Zpětnovazební učení (Reinforcement Learning)", "Hluboké učení"],
                    correctAnswer: 2,
                    explanation: "Reinforcement Learning je založeno na interakci agenta s prostředím, kde za své akce získává odměny nebo tresty."
                },
                {
                    question: "Co znamená zkratka LLM?",
                    options: ["Large Learning Mode", "Large Language Model", "Long Lasting Memory", "Logic Language Machine"],
                    correctAnswer: 1,
                    explanation: "LLM znamená Large Language Model (velký jazykový model), což je typ AI trénovaný na obrovském množství textu."
                },
                {
                    question: "K čemu slouží 'prompt engineering'?",
                    options: ["K opravě hardwaru", "K návrhu efektivních instrukcí pro AI modely", "K programování v Pythonu", "K tvorbě databází"],
                    correctAnswer: 1,
                    explanation: "Prompt engineering je disciplína zaměřená na formulaci vstupů (promptů) tak, aby AI model vygeneroval co nejpřesnější a nejužitečnější výstup."
                },
                {
                    question: "Jaké je hlavní riziko při používání AI ve škole?",
                    options: ["Vysoká spotřeba elektřiny", "Příliš rychlé učení studentů", "Nekritické přebírání informací a plagiátorství", "AI nemá žádná rizika"],
                    correctAnswer: 2,
                    explanation: "Jedním z hlavních rizik je, že studenti mohou používat AI k vypracování úkolů bez porozumění nebo převezmou chybné informace."
                }
            ]
        };

        const flashcardsData = {
            cards: [
                { front: "Neuronová síť", back: "Výpočetní model inspirovaný strukturou lidského mozku, používaný pro strojové učení." },
                { front: "Strojové učení (Machine Learning)", back: "Podobor AI, který dává počítačům schopnost učit se z dat bez explicitního programování." },
                { front: "Generativní AI", back: "Typ umělé inteligence schopný vytvářet nový obsah (text, obrazy, hudbu) na základě trénovacích dat." },
                { front: "Turingův test", back: "Test navržený Alanem Turingem k určení, zda se stroj dokáže chovat inteligentně a nerozeznatelně od člověka." },
                { front: "Deepfake", back: "Syntetické médium, ve kterém je osoba na existujícím obrázku nebo videu nahrazena podobou někoho jiného pomocí AI." }
            ]
        };

        await addDoc(collection(db, lessonsPath), {
            title: "AI v Edukácii",
            subtitle: "Jak využít umělou inteligenci ve výuce",
            topic: "Informatika",
            ownerId: user.uid,
            isPublished: true,
            status: "published",
            createdAt: serverTimestamp(),
            assignedToGroups: [classRef.id],
            textContent: "Umělá inteligence (AI) transformuje vzdělávání tím, že nabízí personalizované učení, automatizaci administrativy a nové nástroje pro tvorbu obsahu. V této lekci si vyzkoušíte interaktivní kvíz a kartičky generované AI.",
            quiz: quizData,
            flashcards: flashcardsData
        });

        console.log("Professor Demo Data Created.");
    }

    async initStudentDemo() {
        const user = auth.currentUser;
        if (!user || !user.isAnonymous) return;

        console.log("Initializing Student Demo...");

        // 1. Create a Class for the student to belong to
        const groupsPath = getCollectionPath('groups');
        const classRef = await addDoc(collection(db, groupsPath), {
            name: "Fyzika 8.B",
            ownerId: user.uid, // FIX: Use user.uid instead of "demo-professor-id"
            ownerName: "Albert Einstein",
            joinCode: "E=MC2",
            studentIds: [user.uid],
            createdAt: serverTimestamp()
        });

        const historyClassRef = await addDoc(collection(db, groupsPath), {
            name: "Dějepis 9.C",
            ownerId: user.uid, // FIX: Use user.uid
            ownerName: "Jára Cimrman",
            joinCode: "HIST01",
            studentIds: [user.uid],
            createdAt: serverTimestamp()
        });

        // 2. Create Student Profile
        const studentsPath = getCollectionPath('students');
        // Note: We use user.uid as the document ID
        await setDoc(doc(db, studentsPath, user.uid), {
            email: "student@demo.cz",
            displayName: "Demo Student",
            memberOfGroups: [classRef.id, historyClassRef.id],
            streak: 3
        });

        // 3. Create Lessons for that class
        const lessonsPath = getCollectionPath('lessons');

        // Physics Lesson
        await addDoc(collection(db, lessonsPath), {
            title: "Newtonovy zákony",
            subtitle: "Zákon setrvačnosti, síly a akce a reakce",
            topic: "Fyzika",
            ownerId: user.uid, // FIX
            isPublished: true,
            status: "published",
            createdAt: serverTimestamp(),
            assignedToGroups: [classRef.id],
            textContent: "Isaac Newton formuloval tři pohybové zákony, které tvoří základ klasické mechaniky. 1. Zákon setrvačnosti: Těleso setrvává v klidu nebo v rovnoměrném přímočarém pohybu, pokud na něj nepůsobí síla."
        });

        // Homework
        await addDoc(collection(db, lessonsPath), {
            title: "Domácí úkol: Gravitace",
            subtitle: "Vypočítejte gravitační sílu",
            topic: "Fyzika",
            ownerId: user.uid, // FIX
            isPublished: true,
            status: "published",
            createdAt: serverTimestamp(),
            assignedToGroups: [classRef.id],
            textContent: "Vaším úkolem je vypočítat gravitační sílu mezi Zemí a Měsícem."
        });

        // History Lesson (Rich Content)
        await addDoc(collection(db, lessonsPath), {
            title: "Druhá světová válka",
            subtitle: "Globální konflikt 1939-1945",
            topic: "Dějepis",
            ownerId: user.uid, // FIX
            isPublished: true,
            status: "published",
            createdAt: serverTimestamp(),
            assignedToGroups: [historyClassRef.id],
            textContent: "Druhá světová válka byl globální vojenský konflikt, který začal 1. září 1939 útokem Německa na Polsko. Zapojila se do něj většina států světa, které se rozdělily na dva tábory: Spojence a Osu. Válka v Evropě skončila 8. května 1945 kapitulací Německa, v Asii pak 2. září 1945 kapitulací Japonska po svržení atomových bomb na Hirošimu a Nagasaki.",
            flashcards: {
                cards: [
                    { front: "1. září 1939", back: "Začátek 2. světové války (útok na Polsko)" },
                    { front: "8. května 1945", back: "Konec války v Evropě (Den vítězství)" },
                    { front: "Osa", back: "Vojenská aliance Německa, Itálie a Japonska" },
                    { front: "Spojenci", back: "Vojenská aliance vedená Velkou Británií, USA a SSSR" },
                    { front: "Operace Overlord", back: "Vylodění v Normandii (D-Day), otevření západní fronty" }
                ]
            }
        });

        console.log("Student Demo Data Created.");
    }
}
