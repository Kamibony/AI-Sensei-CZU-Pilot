// functions/src/firebase-admin-init.ts

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// Inicializujeme Firebase a exportujeme kľúčové služby,
// aby ich mohli ostatné súbory bezpečne používať.
export const adminApp = initializeApp();
export const db = getFirestore(adminApp);
export const auth = getAuth(adminApp);
