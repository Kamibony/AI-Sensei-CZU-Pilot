import * as admin from "firebase-admin";

// Inicializácia Firebase Admin SDK
// Táto funkcia sa automaticky postará o načítanie konfigurácie z prostredia Firebase
admin.initializeApp();

// Vytvorenie a exportovanie inštancie Firestore databázy
export const db = admin.firestore();
