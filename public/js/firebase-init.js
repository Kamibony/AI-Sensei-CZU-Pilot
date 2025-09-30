import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

// Fallback configuration for local development or if auto-init fails
const fallbackConfig = {
    apiKey: "AIzaSyB3mUbw9cC8U6UzUNvPadrwdhjXFcu3aeA",
    authDomain: "ai-sensei-czu-pilot.firebaseapp.com",
    projectId: "ai-sensei-czu-pilot",
    storageBucket: "ai-sensei-czu-pilot.appspot.com",
    messagingSenderId: "413145704611",
    appId: "1:413145704611:web:75f8e571995276f99af716",
    measurementId: "G-4QDC0F2Q6Q"
};

let app;

try {
    // Try to fetch the configuration from Firebase Hosting
    const response = await fetch('/__/firebase/init.json');
    const firebaseConfig = await response.json();
    app = initializeApp(firebaseConfig);
} catch (e) {
    console.warn("Could not load automatic Firebase configuration. Using fallback for local development.", e);
    app = initializeApp(fallbackConfig);
}

// Initialize and export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
// Ensure the function is initialized with the correct region
export const functions = getFunctions(app, 'europe-west1');
// Export commonly used functions for convenience
export { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
export { collection, getDocs, query, orderBy, doc, getDoc, setDoc, addDoc, serverTimestamp, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
export { onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";