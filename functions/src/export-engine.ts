import { onCall, CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldPath } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";

const db = getFirestore();

// Duplicate bucket logic to ensure consistency
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const FIREBASE_CONFIG = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : {};
const STORAGE_BUCKET = FIREBASE_CONFIG.storageBucket || (PROJECT_ID === "ai-sensei-prod" ? "ai-sensei-prod.firebasestorage.app" : "ai-sensei-czu-pilot.firebasestorage.app");

export const exportAnonymizedData = onCall({
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "1GiB"
}, async (request: CallableRequest) => {
    // 1. Validation
    if (!request.auth || request.auth.token.role !== "professor") {
        throw new HttpsError("unauthenticated", "Only professors can export data.");
    }

    const { classId, format } = request.data;
    if (!classId || !format) {
        throw new HttpsError("invalid-argument", "Missing classId or format (json/csv).");
    }

    try {
        logger.log(`Exporting data for class ${classId} in ${format} format...`);

        // 2. Fetch Students
        const groupRef = db.collection("groups").doc(classId);
        const groupDoc = await groupRef.get();
        if (!groupDoc.exists) {
            throw new HttpsError("not-found", "Class not found.");
        }
        const studentIds: string[] = groupDoc.data()?.studentIds || [];

        if (studentIds.length === 0) {
            throw new HttpsError("failed-precondition", "No students in this class.");
        }

        // 3. Create Anonymization Map
        const anonMap: { [uid: string]: string } = {};
        studentIds.forEach((uid, index) => {
            anonMap[uid] = `Participant_${String(index + 1).padStart(3, '0')}`;
        });

        // 4. Fetch All Data (Chunked)
        const rawData: any[] = [];

        const processChunk = async (ids: string[]) => {
            if (ids.length === 0) return;

            // Fetch Student Profiles to get group_variant
            const variants: {[id: string]: string} = {};
            try {
                const studentsSnap = await db.collection("students")
                    .where(FieldPath.documentId(), "in", ids)
                    .get();
                studentsSnap.forEach(doc => {
                    variants[doc.id] = doc.data().group_variant || "default";
                });
            } catch (e) {
                logger.warn("Failed to fetch student variants, using default.", e);
                ids.forEach(id => variants[id] = "default");
            }

            // Fetch Quizzes
            const quizzesSnap = await db.collection("quiz_submissions")
                .where("studentId", "in", ids)
                .get();
            quizzesSnap.forEach(doc => {
                const d = doc.data();
                rawData.push({
                    type: "quiz",
                    participant_id: anonMap[d.studentId], // Anonymized
                    group_variant: variants[d.studentId],
                    timestamp: d.submittedAt?.toDate ? d.submittedAt.toDate().toISOString() : d.submittedAt,
                    score: d.score,
                    topic: d.quizTitle || "N/A",
                    lesson_id: d.lessonId
                });
            });

             // Fetch Tests
             const testsSnap = await db.collection("test_submissions")
                .where("studentId", "in", ids)
                .get();
            testsSnap.forEach(doc => {
                const d = doc.data();
                rawData.push({
                    type: "test",
                    participant_id: anonMap[d.studentId],
                    group_variant: variants[d.studentId],
                    timestamp: d.submittedAt?.toDate ? d.submittedAt.toDate().toISOString() : d.submittedAt,
                    score: d.score,
                    topic: d.testTitle || "N/A",
                    lesson_id: d.lessonId
                });
            });

            // Fetch Crisis Logs
            const logsSnap = await db.collection("crisis_logs")
                .where("studentId", "in", ids)
                .get();
            logsSnap.forEach(doc => {
                const d = doc.data();
                rawData.push({
                    type: "crisis_resolution",
                    participant_id: anonMap[d.studentId],
                    group_variant: variants[d.studentId],
                    timestamp: d.resolvedAt?.toDate ? d.resolvedAt.toDate().toISOString() : d.resolvedAt,
                    duration_ms: d.durationMs,
                    topic: d.crisisTitle || "N/A",
                    lesson_id: d.lessonId
                });
            });

            // Fetch Roles
            const rolePromises = ids.map(async (sid) => {
                const progressSnap = await db.collection("students").doc(sid).collection("progress").get();
                progressSnap.forEach(doc => {
                    const d = doc.data();
                    if (d.selectedRole) {
                        rawData.push({
                            type: "role_selection",
                            participant_id: anonMap[sid],
                            group_variant: variants[sid],
                            timestamp: d.startedAt || null,
                            lesson_id: doc.id,
                            topic: d.selectedRole,
                            score: null,
                            duration_ms: null
                        });
                    }
                });
            });
            await Promise.all(rolePromises);
        };

        for (let i = 0; i < studentIds.length; i += 30) {
            await processChunk(studentIds.slice(i, i + 30));
        }

        // 5. Format Output
        let fileContent = "";
        let contentType = "application/json";
        let extension = "json";

        if (format === 'csv') {
            contentType = "text/csv";
            extension = "csv";
            // Header
            fileContent += "participant_id,group_variant,type,timestamp,lesson_id,topic,score,duration_ms\n";
            // Rows
            rawData.forEach(row => {
                fileContent += `${row.participant_id},${row.group_variant},${row.type},${row.timestamp},${row.lesson_id},"${row.topic}",${row.score !== undefined ? row.score : ''},${row.duration_ms !== undefined ? row.duration_ms : ''}\n`;
            });
        } else {
            fileContent = JSON.stringify(rawData, null, 2);
        }

        // 6. Upload to Storage
        const bucket = getStorage().bucket(STORAGE_BUCKET);
        const fileName = `exports/${classId}_${Date.now()}.${extension}`;
        const file = bucket.file(fileName);

        await file.save(fileContent, {
            metadata: { contentType: contentType }
        });

        // 7. Get Signed URL
        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
        });

        return { success: true, url: url, fileName: fileName };

    } catch (error: any) {
        logger.error("Error exporting data:", error);
        throw new HttpsError("internal", "Failed to export data.");
    }
});
