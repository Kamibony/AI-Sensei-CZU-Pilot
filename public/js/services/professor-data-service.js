import { collection, getDocs, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, auth } from '../firebase-init.js';
import { showToast } from '../utils.js';

export class ProfessorDataService {
    constructor() {
        this.db = db;
        this.auth = auth;
    }

    async fetchLessonById(id) {
        try {
            if (!this.db) return null;

            const q = query(collection(this.db, 'lessons'), where('id', '==', id));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                const doc = querySnapshot.docs[0];
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.warn("Lekcia sa nenašla alebo chýbajú práva:", error);
            return null;
        }
    }

    async fetchLessons() {
        try {
            if (!this.db) {
                console.warn("DB not ready yet.");
                return [];
            }

            // 1. Čakáme na prihlásenie používateľa
            if (!this.auth.currentUser) {
                console.log("Waiting for user auth...");
                return [];
            }

            // 2. FIX: Pridaný filter 'where', aby sme splnili Security Rules
            // DÔLEŽITÉ: Používame 'ownerId', lebo tak je to v firestore.rules
            const q = query(
                collection(this.db, "lessons"),
                where("ownerId", "==", this.auth.currentUser.uid),
                orderBy("createdAt", "desc")
            );

            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

        } catch (error) {
            console.error("Error fetching lessons:", error);

            // 3. Ošetrenie chýbajúceho indexu (časté pri where + orderBy)
            if (error.code === 'failed-precondition') {
                console.warn("⚠️ Chýba index! Otvorte tento odkaz z konzoly prehliadača a vytvorte ho.");
                showToast("Systém: Je potrebné vytvoriť index v databáze (viď konzola).", "warning");
            } else if (error.code === 'permission-denied') {
                showToast("Chyba oprávnení: Nemáte prístup k zoznamu lekcií.", "error");
            } else {
                showToast("Chyba pri načítaní dát.", "error");
            }
            return [];
        }
    }
}
