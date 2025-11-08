import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

export let app;
export let auth;
export let db;
export let storage;
export let functions;
export let analytics;

export async function initializeFirebase() {
    try {
        const response = await fetch('/__/firebase/init.json');
        if (!response.ok) throw new Error('Failed to fetch Firebase config.');
        const firebaseConfig = await response.json();

        // --- OPRAVA: Kontrola, či už app neexistuje ---
        if (getApps().length === 0) {
            app = initializeApp(firebaseConfig);
            console.log("Firebase initialized from production config.");
        } else {
            app = getApp();
            console.log("Firebase already initialized, using existing app.");
        }
        // -------------------------------------------

        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);
        functions = getFunctions(app, 'europe-west1');
        
        // Analytics iba v produkcii, ak ešte nie je inicializovaná
        if (typeof analytics === 'undefined') {
             analytics = getAnalytics(app);
        }

    } catch (e) {
        console.warn("Could not load Firebase config. Initializing for emulators...");
        
        // Aj pre emulátory pridáme rovnakú kontrolu pre istotu
        if (getApps().length === 0) {
             app = initializeApp({
                projectId: 'ai-sensei-czu-pilot',
                apiKey: 'dummy-key',
                authDomain: 'localhost',
                storageBucket: 'default-bucket'
            });
        } else {
            app = getApp();
        }

        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);
        functions = getFunctions(app, 'europe-west1');

        // Pri emulátoroch sa chceme pripojiť len raz
        // (zjednodušená kontrola, či už bežíme na localhoste, aby sme nepripájali emulátory opakovane)
        if (!auth.emulatorConfig) {
            console.log("Connecting to Firebase Emulators...");
            connectAuthEmulator(auth, "http://127.0.0.1:9099");
            connectFirestoreEmulator(db, '127.0.0.1', 8080);
            connectFunctionsEmulator(functions, '127.0.0.1', 5001);
            connectStorageEmulator(storage, '127.0.0.1', 9199);
            console.log("Successfully connected to all running emulators.");
        }
    }
}
