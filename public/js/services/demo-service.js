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
            ownerId: "demo-professor-id", // Mock owner
            ownerName: "Albert Einstein",
            joinCode: "E=MC2",
            studentIds: [user.uid],
            createdAt: serverTimestamp()
        });

        // 2. Create Student Profile
        const studentsPath = getCollectionPath('students');
        // Note: We use user.uid as the document ID
        await setDoc(doc(db, studentsPath, user.uid), {
            email: "student@demo.cz",
            displayName: "Demo Student",
            memberOfGroups: [classRef.id],
            streak: 3
        });

        // 3. Create Lessons for that class
        const lessonsPath = getCollectionPath('lessons');

        await addDoc(collection(db, lessonsPath), {
            title: "Newtonovy zákony",
            subtitle: "Zákon setrvačnosti, síly a akce a reakce",
            topic: "Fyzika",
            ownerId: "demo-professor-id",
            isPublished: true,
            status: "published",
            createdAt: serverTimestamp(),
            assignedToGroups: [classRef.id],
            textContent: "Isaac Newton formuloval tři pohybové zákony, které tvoří základ klasické mechaniky. 1. Zákon setrvačnosti: Těleso setrvává v klidu nebo v rovnoměrném přímočarém pohybu, pokud na něj nepůsobí síla."
        });

        // Add a "Homework" task (conceptually just another lesson or task, but simple lesson here)
        await addDoc(collection(db, lessonsPath), {
            title: "Domácí úkol: Gravitace",
            subtitle: "Vypočítejte gravitační sílu",
            topic: "Fyzika",
            ownerId: "demo-professor-id",
            isPublished: true,
            status: "published",
            createdAt: serverTimestamp(),
            assignedToGroups: [classRef.id],
            textContent: "Vaším úkolem je vypočítat gravitační sílu mezi Zemí a Měsícem."
        });

        console.log("Student Demo Data Created.");
    }
}
