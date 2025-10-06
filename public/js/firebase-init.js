import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

// Import the main application UI logic
import { initializeAppUI } from './app.js';

let app;
let auth;
let db;
let storage;
let functions;

async function initializeFirebase() {
    try {
        const response = await fetch('/__/firebase/init.json');
        const firebaseConfig = await response.json();
        app = initializeApp(firebaseConfig);
        console.log("Firebase initialized from production config.");

        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);
        functions = getFunctions(app, 'europe-west1');

    } catch (e) {
        console.warn(
            "Could not load Firebase configuration. Initializing for emulators..."
        );
        app = initializeApp({
            projectId: 'ai-sensei-czu-pilot',
            apiKey: 'dummy-key',
            authDomain: 'localhost',
            storageBucket: 'default-bucket'
        });

        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);
        functions = getFunctions(app, 'europe-west1');

        console.log("Connecting to Firebase Emulators...");
        connectAuthEmulator(auth, "http://127.0.0.1:9099");
        connectFirestoreEmulator(db, '127.0.0.1', 8080);
        connectFunctionsEmulator(functions, '127.0.0.1', 5001);
        connectStorageEmulator(storage, '127.0.0.1', 9199);
        console.log("Successfully connected to all running emulators.");
    }

    // This is the critical change: Call the main app logic only AFTER Firebase is ready.
    initializeAppUI(auth, db, storage, functions);
}

// Start the entire application
initializeFirebase();

// Export the initialized services for any other modules that might need them
export { app, auth, db, storage, functions };