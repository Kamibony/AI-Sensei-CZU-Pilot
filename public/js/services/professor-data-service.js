import { collection, getDocs, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, auth } from '../firebase-init.js';
import { showToast, getCollectionPath } from '../utils/utils.js';

export class ProfessorDataService {
    constructor() {
        this.db = db;
        this.auth = auth;
    }

    async fetchLessonById(id) {
        try {
            if (!this.db) return null;

            const user = this.auth.currentUser;
            if (!user) return null;

            const lessonsPath = getCollectionPath('lessons');
            const q = query(
                collection(this.db, lessonsPath),
                where('id', '==', id),
                where('ownerId', '==', user.uid)
            );

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
            const lessonsPath = getCollectionPath('lessons');
            const q = query(
                collection(this.db, lessonsPath),
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

    async getAdvancedAnalytics() {
        if (!this.auth.currentUser || !this.db) {
            // Return Zero Data structure if not logged in
            return this._getZeroData();
        }
        const uid = this.auth.currentUser.uid;

        try {
            // 1. Fetch Groups
            const groupsPath = getCollectionPath('groups');
            const groupsQuery = query(collection(this.db, groupsPath), where("ownerId", "==", uid));
            const groupsSnap = await getDocs(groupsQuery);
            const groups = groupsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const groupIds = groups.map(g => g.id);

            // 2. Fetch Students (Batching required - limit 10 for array-contains-any)
            let students = [];
            if (groupIds.length > 0) {
                const studentsPath = getCollectionPath('students');
                const batches = [];
                for (let i = 0; i < groupIds.length; i += 10) {
                    const batch = groupIds.slice(i, i + 10);
                    batches.push(getDocs(query(collection(this.db, studentsPath), where("memberOfGroups", "array-contains-any", batch))));
                }
                const studentSnaps = await Promise.all(batches);
                const studentMap = new Map();
                studentSnaps.forEach(snap => {
                    snap.docs.forEach(d => studentMap.set(d.id, { id: d.id, ...d.data() }));
                });
                students = Array.from(studentMap.values());
            }

            // 3. Fetch Lessons
            const lessonsPath = getCollectionPath('lessons');
            const lessonsQuery = query(collection(this.db, lessonsPath), where("ownerId", "==", uid));
            const lessonsSnap = await getDocs(lessonsQuery);
            const lessons = lessonsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const lessonIds = lessons.map(l => l.id);

            // 4. Fetch Submissions (Batching required - limit 30 for 'in')
            let quizSubmissions = [];
            let testSubmissions = [];

            if (lessonIds.length > 0) {
                const fetchSubmissions = async (collName) => {
                    const batches = [];
                    const path = getCollectionPath(collName);
                    for (let i = 0; i < lessonIds.length; i += 30) {
                        const batch = lessonIds.slice(i, i + 30);
                        batches.push(getDocs(query(collection(this.db, path), where("lessonId", "in", batch))));
                    }
                    const snaps = await Promise.all(batches);
                    return snaps.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() })));
                };

                // Execute in parallel
                [quizSubmissions, testSubmissions] = await Promise.all([
                    fetchSubmissions('quiz_submissions'),
                    fetchSubmissions('test_submissions')
                ]);
            }

            // 5. Aggregation Logic
            const totalStudents = students.length;

            // Engagement: Submissions in last 7 days / Total Students
            const now = new Date();
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

            const allSubmissions = [...quizSubmissions, ...testSubmissions];
            const activeSubmissions = allSubmissions.filter(s => {
                const ts = s.submittedAt?.toDate ? s.submittedAt.toDate() : new Date(s.submittedAt);
                return ts > oneWeekAgo;
            });

            const uniqueActiveStudents = new Set(activeSubmissions.map(s => s.studentId)).size;
            const engagementScore = totalStudents > 0 ? Math.round((uniqueActiveStudents / totalStudents) * 100) : 0;

            // Performance: Avg Score
            const allScores = allSubmissions.map(s => s.score || 0);
            const avgScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;

            // Content Velocity: Total submissions in last 7 days
            const contentVelocity = activeSubmissions.length;

            // Risk Detection & Student Stats
            const studentStats = {};
            // Initialize with all students
            students.forEach(s => {
                studentStats[s.id] = {
                    name: s.name || s.email || 'Unknown Student',
                    email: s.email,
                    scores: [],
                    lastSubmission: null,
                    id: s.id,
                    submissionCount: 0
                };
            });

            // Populate stats from submissions
            allSubmissions.forEach(s => {
                if (studentStats[s.studentId]) {
                    studentStats[s.studentId].scores.push(s.score || 0);
                    studentStats[s.studentId].submissionCount++;

                    const ts = s.submittedAt?.toDate ? s.submittedAt.toDate() : new Date(s.submittedAt);
                    if (!studentStats[s.studentId].lastSubmission || ts > studentStats[s.studentId].lastSubmission) {
                        studentStats[s.studentId].lastSubmission = ts;
                    }
                }
            });

            const needsAttention = [];
            const topPerformers = [];

            Object.values(studentStats).forEach(stat => {
                const avg = stat.scores.length > 0 ? stat.scores.reduce((a, b) => a + b, 0) / stat.scores.length : 0;
                const isInactive = !stat.lastSubmission || stat.lastSubmission < oneWeekAgo;

                // Risk: < 50% avg score OR (0 submissions in last week IF they have previous history or just generally inactive?)
                // Prompt: "Identify students with < 50% average score or 0 submissions in the last week."
                // Interpret "0 submissions in last week" as inactive.

                if (avg < 50 || isInactive) {
                    needsAttention.push({
                        ...stat,
                        reason: avg < 50 ? 'Nízké skóre' : 'Neaktivní',
                        avgScore: Math.round(avg),
                        detail: avg < 50 ? `${Math.round(avg)}% průměr` : 'Žádná aktivita (7 dní)'
                    });
                }

                // Top Performers: > 80% and Active
                if (avg >= 80 && !isInactive) {
                    topPerformers.push({
                        ...stat,
                        avgScore: Math.round(avg),
                        detail: `${Math.round(avg)}% průměr`
                    });
                }
            });

            // Activity Heatmap Data (Last 14 days)
            // Array of 14 integers, where index 13 is today
            const activityData = new Array(14).fill(0);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            allSubmissions.forEach(s => {
                const ts = s.submittedAt?.toDate ? s.submittedAt.toDate() : new Date(s.submittedAt);
                const submissionDay = new Date(ts);
                submissionDay.setHours(0,0,0,0);

                const diffTime = today.getTime() - submissionDay.getTime();
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays >= 0 && diffDays < 14) {
                    // Map to array index: 13 is today (diffDays=0), 0 is 13 days ago (diffDays=13)
                    activityData[13 - diffDays]++;
                }
            });

            // Grade Distribution (A-F)
            // A: 90-100, B: 80-89, C: 70-79, D: 60-69, F: <60
            const gradeDist = { A: 0, B: 0, C: 0, D: 0, F: 0 };

            // Only count students who have at least one score? Or count 0 as F?
            // "Performance: Calculate average scores from quiz_results."
            Object.values(studentStats).forEach(stat => {
                if (stat.scores.length === 0) return; // Skip students with no data for distribution
                const avg = stat.scores.reduce((a, b) => a + b, 0) / stat.scores.length;

                if (avg >= 90) gradeDist.A++;
                else if (avg >= 80) gradeDist.B++;
                else if (avg >= 70) gradeDist.C++;
                else if (avg >= 60) gradeDist.D++;
                else gradeDist.F++;
            });

            return {
                metrics: {
                    totalReach: {
                        value: totalStudents,
                        trend: totalStudents > 0 ? "Aktivní" : "0",
                        explanation: "Celkový počet unikátních studentů ve vašich skupinách."
                    },
                    engagementScore: {
                        value: `${engagementScore}%`,
                        trend: `${uniqueActiveStudents} studentů`,
                        explanation: "Procento studentů, kteří odevzdali lekci za posledních 7 dní."
                    },
                    knowledgeMastery: {
                        value: `${avgScore}%`,
                        trend: "Průměr třídy",
                        explanation: "Celkové průměrné skóre ze všech odevzdaných testů a kvízů."
                    },
                    contentVelocity: {
                        value: contentVelocity,
                        trend: "Odevzdání (7 dní)",
                        explanation: "Počet odevzdaných lekcí všemi studenty za posledních 7 dní."
                    }
                },
                charts: {
                    activity: activityData,
                    grades: [gradeDist.A, gradeDist.B, gradeDist.C, gradeDist.D, gradeDist.F] // Array for Chart.js
                },
                insights: {
                    needsAttention: needsAttention.slice(0, 5), // Top 5 risks
                    topPerformers: topPerformers.sort((a, b) => b.avgScore - a.avgScore).slice(0, 5)
                },
                meta: {
                    lastUpdated: new Date().toISOString()
                }
            };

        } catch (error) {
            console.error("Advanced analytics fetch error:", error);
            return this._getZeroData();
        }
    }

    _getZeroData() {
        return {
            metrics: {
                totalReach: { value: 0, trend: "-", explanation: "Celkový počet studentů." },
                engagementScore: { value: "0%", trend: "-", explanation: "Aktivita za poslední týden." },
                knowledgeMastery: { value: "0%", trend: "-", explanation: "Průměrné skóre." },
                contentVelocity: { value: 0, trend: "-", explanation: "Počet odevzdání." }
            },
            charts: {
                activity: new Array(14).fill(0),
                grades: [0, 0, 0, 0, 0]
            },
            insights: {
                needsAttention: [],
                topPerformers: []
            },
            meta: {
                lastUpdated: new Date().toISOString()
            }
        };
    }
}
