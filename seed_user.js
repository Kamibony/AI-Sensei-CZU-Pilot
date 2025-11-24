
const admin = require('firebase-admin');

// Configure admin to talk to the emulator
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

admin.initializeApp({
  projectId: 'ai-sensei-czu-pilot'
});

async function seedUser() {
  const email = 'prof_seeded@test.com';
  const password = 'password123';
  const role = 'professor';

  try {
    // 1. Create User in Auth
    let userRecord;
    try {
        userRecord = await admin.auth().getUserByEmail(email);
        console.log(`User ${email} already exists. Updating...`);
    } catch (e) {
        if (e.code === 'auth/user-not-found') {
            userRecord = await admin.auth().createUser({
                email: email,
                password: password,
            });
            console.log(`User created: ${userRecord.uid}`);
        } else {
            throw e;
        }
    }

    // 2. Set Claims
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: role });
    console.log(`Claims set for ${role}`);

    // 3. Create Firestore User Document
    const db = admin.firestore();
    await db.collection('users').doc(userRecord.uid).set({
        email: email,
        role: role,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('User document created.');

    console.log('SEEDING SUCCESSFUL');
    process.exit(0);

  } catch (error) {
    console.error('SEEDING FAILED:', error);
    process.exit(1);
  }
}

seedUser();
