
const admin = require('firebase-admin');

// Initialize Firebase Admin
// Requires GOOGLE_APPLICATION_CREDENTIALS environment variable or default credentials
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'ai-sensei-czu-pilot'
    });
}

const db = admin.firestore();

async function cleanup() {
    console.log("Starting cleanup of test lessons...");
    const lessonsRef = db.collection('lessons');
    let deletedCount = 0;

    try {
        // 1. Delete lessons with ownerId containing 'test'
        // Firestore doesn't support regex/contains queries on fields directly, so we might need to scan or use exact match if known.
        // Assuming 'test' or 'test-user'.
        // Also the prompt mentioned "Recurring" titles.

        const snapshot = await lessonsRef.get();

        if (snapshot.empty) {
            console.log("No lessons found.");
            return;
        }

        const batch = db.batch();
        let batchCount = 0;
        const MAX_BATCH_SIZE = 500;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            let shouldDelete = false;

            // Check ownerId
            if (data.ownerId && (data.ownerId.includes('test') || data.ownerId === 'antek@antek.sk' && data.title && data.title.includes('Recurring'))) {
                // Be careful with antek, he is a real user in tests. Only delete if it looks like a test artifact.
                // The prompt says "ownerId should be a test ID or check for the specific 'Recurring' titles".
            }

            // Check title
            if (data.title && (data.title.includes('Recurring') || data.title.includes('Test Lesson'))) {
                shouldDelete = true;
            }

            // Check date artifacts (Jan 30 2026)
            if (data.availableAt) {
                const date = data.availableAt.toDate ? data.availableAt.toDate() : new Date(data.availableAt);
                // Check if date is 2026-01-30
                const dateStr = date.toISOString().split('T')[0];
                if (dateStr === '2026-01-30') {
                    console.log(`Found lesson with suspicious date 2026-01-30: ${data.title}`);
                    shouldDelete = true;
                }
            }

            if (shouldDelete) {
                console.log(`Deleting lesson: ${doc.id} - ${data.title} (${data.ownerId})`);
                batch.delete(doc.ref);
                batchCount++;
                deletedCount++;
            }

            if (batchCount >= MAX_BATCH_SIZE) {
                await batch.commit();
                batchCount = 0;
            }
        }

        if (batchCount > 0) {
            await batch.commit();
        }

        console.log(`Cleanup complete. Deleted ${deletedCount} lessons.`);

    } catch (error) {
        console.error("Error during cleanup:", error);
    }
}

cleanup();
