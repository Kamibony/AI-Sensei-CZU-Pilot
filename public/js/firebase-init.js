import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const IS_EMULATOR = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';

let app;
let auth;
let db;
let storage;
let functions;

try {
    // Try to fetch the configuration from Firebase Hosting.
    const response = await fetch('/__/firebase/init.json');
    const firebaseConfig = await response.json();
    app = initializeApp(firebaseConfig);
    console.log("Firebase initialized from production config.");

    // Initialize services for production
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    functions = getFunctions(app, 'us-central1');

} catch (e) {
    // If the fetch fails, it's likely because the app is being served locally.
    // In this case, we configure for the Local Emulator Suite.
    console.warn(
        "Could not load Firebase configuration from '/__/firebase/init.json'.\n" +
        "This is expected during local development. Initializing for emulators..."
    );

    // Use a dummy config for emulator initialization.
    // The projectId must match the one in .firebaserc.
    app = initializeApp({
        projectId: 'ai-sensei-czu-pilot',
        apiKey: 'dummy-key',
        authDomain: 'localhost',
        storageBucket: 'default-bucket'
    });

    // Get service instances
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    functions = getFunctions(app, 'us-central1');

    // Connect to the running emulators
    console.log("Connecting to Firebase Emulators...");
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    console.log("Successfully connected to all running emulators.");
}

// Export the initialized services for use in other modules.
export { app, auth, db, storage, functions };