import { onCall, CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

export const generateClassReport = onCall({
    region: "europe-west1",
    timeoutSeconds: 300,
    memory: "1GiB"
}, async (request: CallableRequest) => {
    // 1. Validation
    if (!request.auth || request.auth.token.role !== "professor") {
        throw new HttpsError("unauthenticated", "Only professors can generate class reports.");
    }

    const { classId } = request.data;
    if (!classId) {
        throw new HttpsError("invalid-argument", "Missing classId.");
    }

    try {
        logger.log(`Generating class report for ${classId}...`);

        // 2. Fetch Students in Class
        // We assume 'groups' collection contains the class document with a 'studentIds' array
        const groupRef = db.collection("groups").doc(classId);
        const groupDoc = await groupRef.get();
        if (!groupDoc.exists) {
            throw new HttpsError("not-found", "Class (Group) not found.");
        }

        const groupData = groupDoc.data();
        const studentIds: string[] = groupData?.studentIds || [];

        if (studentIds.length === 0) {
            return { message: "No students in this class.", generatedAt: new Date().toISOString() };
        }

        // 3. Batch Fetch Helper (limit 10 for 'in' queries, though we will loop differently here to avoid limits)
        // Since we have specific IDs, we can fetch them or query collections where studentId is in list.
        // Queries with 'in' are limited to 30. If class is large, we must chunk.

        // --- COGNITIVE METRICS (Quiz/Test Scores & Knowledge Map) ---
        let totalQuizScore = 0;
        let quizCount = 0;
        let totalTestScore = 0;
        let testCount = 0;
        const topicFailures: { [topic: string]: { failures: number, total: number } } = {};

        // Helper to process chunks
        const processChunk = async (ids: string[]) => {
            if (ids.length === 0) return;

            // Fetch Quizzes
            const quizzesSnap = await db.collection("quiz_submissions")
                .where("studentId", "in", ids)
                .get();

            quizzesSnap.forEach(doc => {
                const data = doc.data();
                const score = typeof data.score === "number" ? data.score : 0; // 0-1
                totalQuizScore += score;
                quizCount++;

                // Topic Analysis (Knowledge Heatmap)
                // Assuming 'quizTitle' reflects topic, or we need to lookup lesson.
                // For MVP, we use quizTitle as topic proxy.
                const topic = data.quizTitle || "Unknown Topic";
                if (!topicFailures[topic]) topicFailures[topic] = { failures: 0, total: 0 };
                topicFailures[topic].total++;
                if (score < 0.5) topicFailures[topic].failures++; // Fail threshold < 50%
            });

            // Fetch Tests
            const testsSnap = await db.collection("test_submissions")
                .where("studentId", "in", ids)
                .get();

            testsSnap.forEach(doc => {
                const data = doc.data();
                const score = typeof data.score === "number" ? data.score : 0;
                totalTestScore += score;
                testCount++;
            });
        };

        // Chunking student IDs for Firestore 'in' query limit (30)
        for (let i = 0; i < studentIds.length; i += 30) {
            await processChunk(studentIds.slice(i, i + 30));
        }

        const avgQuizScore = quizCount > 0 ? (totalQuizScore / quizCount) * 100 : 0;

        // Knowledge Heatmap Construction
        const knowledgeHeatmap = Object.entries(topicFailures).map(([topic, stats]) => ({
            topic,
            failureRate: stats.total > 0 ? (stats.failures / stats.total) * 100 : 0,
            attempts: stats.total
        })).sort((a, b) => b.failureRate - a.failureRate); // Sort by highest failure rate

        // --- BEHAVIORAL METRICS (Crisis Resilience) ---
        // Query new 'crisis_logs' collection
        let totalReactionTime = 0;
        let crisisCount = 0;

        // We can query logs where 'studentId' is in our list. Again, chunking.
        for (let i = 0; i < studentIds.length; i += 30) {
            const chunk = studentIds.slice(i, i + 30);
            const logsSnap = await db.collection("crisis_logs")
                .where("studentId", "in", chunk)
                .get();

            logsSnap.forEach(doc => {
                const data = doc.data();
                if (data.durationMs) {
                    totalReactionTime += data.durationMs;
                    crisisCount++;
                }
            });
        }

        const avgCrisisResolutionTime = crisisCount > 0 ? (totalReactionTime / crisisCount) / 1000 : 0; // in seconds

        // --- SOCIAL METRICS (Role Distribution) ---
        const roleDistribution: { [role: string]: number } = {};

        const processRoles = async (ids: string[]) => {
            const rolePromises = ids.map(async (sid) => {
                const progressSnap = await db.collection("students").doc(sid).collection("progress").get();
                progressSnap.forEach(doc => {
                    const role = doc.data().selectedRole;
                    if (role) {
                        roleDistribution[role] = (roleDistribution[role] || 0) + 1;
                    }
                });
            });
            await Promise.all(rolePromises);
        };

        for (let i = 0; i < studentIds.length; i += 30) {
            await processRoles(studentIds.slice(i, i + 30));
        }


        // 4. Construct Summary Object
        const report = {
            classId: classId,
            generatedAt: FieldValue.serverTimestamp(),
            metrics: {
                cognitive: {
                    avgQuizScore: parseFloat(avgQuizScore.toFixed(1)),
                    knowledgeHeatmap: knowledgeHeatmap.slice(0, 5) // Top 5 problematic topics
                },
                behavioral: {
                    avgCrisisResolutionSeconds: parseFloat(avgCrisisResolutionTime.toFixed(1)),
                    crisisCount: crisisCount
                },
                social: {
                    roleDistribution: roleDistribution // Placeholder for now
                }
            },
            meta: {
                studentCount: studentIds.length,
                dataRange: "All Time" // Could filter by date
            }
        };

        // 5. Persistence
        await db.collection("groups").doc(classId).collection("analytics").doc("latest_report").set(report);

        logger.log(`Class report generated for ${classId}.`);
        return { success: true, report: report };

    } catch (error: any) {
        logger.error("Error generating class report:", error);
        throw new HttpsError("internal", "Failed to generate class report.");
    }
});
