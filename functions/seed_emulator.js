const admin = require("firebase-admin");

// Initialize app with emulator connection details
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "ai-sensei-czu-pilot";

admin.initializeApp({
  projectId: "ai-sensei-czu-pilot"
});

const auth = admin.auth();
const db = admin.firestore();

async function seed() {
  const email = "profesor@profesor.cz";
  const password = "password123";
  const uid = "profesor_main";

  try {
    // 1. Create Authentication User
    try {
      await auth.createUser({
        uid: uid,
        email: email,
        password: password,
        emailVerified: true
      });
      console.log(`Created Auth user: ${email}`);
    } catch (e) {
      if (e.code === 'auth/email-already-exists') {
        console.log(`Auth user ${email} already exists. resetting password...`);
        await auth.updateUser(uid, { password: password });
      } else {
        throw e;
      }
    }

    // 2. Set Custom Claims (Role)
    await auth.setCustomUserClaims(uid, { role: 'professor' });
    console.log("Set custom claims: role='professor'");

    // 3. Create Firestore User Document
    await db.collection("users").doc(uid).set({
      email: email,
      role: 'professor',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("Created Firestore document in 'users'");

    // 4. Create sample lesson to verify dashboard stats
    await db.collection("lessons").add({
        title: "Sample Lesson",
        ownerId: uid,
        status: 'Aktivní',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("Seeding complete. You can now log in.");
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
}

seed();
