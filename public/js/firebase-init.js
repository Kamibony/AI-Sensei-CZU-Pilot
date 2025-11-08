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
        console.warn("Could not load auto-config. Using hardcoded production config.", e);
        
        // 2. Záložná (hardcoded) produkčná konfigurácia
        const prodConfig = {
            apiKey: "AIzaSyDaGUJ1tCneK9EA7pCi-0fWEJkFvyhc-6I",
            authDomain: "via-academy-prod-3f4e1.firebaseapp.com",
            projectId: "via-academy-prod-3f4e1",
            storageBucket: "via-academy-prod-3f4e1.firebasestorage.app",
            messagingSenderId: "812602866730",
            appId: "1:812602866730:web:efde142d2becc4b66b9753",
            measurementId: "G-F34BQ7LKKC"
        };

        if (getApps().length === 0) {
             app = initializeApp(prodConfig);
             console.log("Firebase initialized from hardcoded prod config.");
        } else {
            app = getApp();
        }
    }

    // Inicializácia služieb
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    functions = getFunctions(app, 'europe-west1');
    
    if (typeof analytics === 'undefined') {
        analytics = getAnalytics(app);
    }

    // (Voliteľné) Emulátory - ak by ste ich niekedy lokálne potrebovali, 
    // odkomentujte a upravte podmienku, aby sa nespúšťali na produkcii.
    // if (window.location.hostname === 'localhost') { ... }
}
