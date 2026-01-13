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
        // 1. Pokus o automatické načítanie konfigurácie
        const response = await fetch('/__/firebase/init.json');
        if (!response.ok) {
             throw new Error('Auto-config failed, switching to fallback.');
        }
        const config = await response.json();
        
        if (getApps().length === 0) {
            app = initializeApp(config);
            console.log("Firebase initialized from auto-config.");
        } else {
            app = getApp();
        }

    } catch (e) {
        console.warn("Could not load auto-config. Using hardcoded local config for ai-sensei-czu-pilot.", e);
        
        // 2. Fallback (hardcoded) local configuration
        // ZMENA: Pridaná podpora pre ante.academy
        const isProd = window.location.hostname.includes('ai-sensei-prod') || window.location.hostname.includes('ante.academy');
        
        const localConfig = {
            projectId: "ai-sensei-czu-pilot",
            appId: "1:812602866730:web:efde142d2becc4b66b9753", // Can be dummy
            storageBucket: isProd ? "ai-sensei-prod.firebasestorage.app" : "ai-sensei-czu-pilot.appspot.com",
            apiKey: "dummy-key",
            authDomain: "ai-sensei-czu-pilot.firebaseapp.com",
            messagingSenderId: "dummy-sender-id",
        };

        if (getApps().length === 0) {
             app = initializeApp(localConfig);
             console.log("Firebase initialized from hardcoded local config.");
        } else {
            app = getApp();
        }
    }

    // Inicializácia služieb
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    functions = getFunctions(app, 'europe-west1');
    
    // Only init analytics in production or if we have a real key to prevent crashes on localhost
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        if (typeof analytics === 'undefined') {
            try {
                analytics = getAnalytics(app);
            } catch (e) {
                console.warn("Analytics initialization skipped:", e);
            }
        }
    } else {
         console.log("Analytics skipped on localhost to avoid invalid API key errors.");
    }

    // Pripojenie k emulátorom, ak bežíme na localhoste
    if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
        console.log("Connecting to Firebase emulators.");
        connectAuthEmulator(auth, "http://127.0.0.1:9099");
        connectFirestoreEmulator(db, "127.0.0.1", 8080);
        connectStorageEmulator(storage, "127.0.0.1", 9199);
        connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    }
}
