// Súbor: public/js/professor.js (KOMPLETNÁ VERZIA S DIAGNOSTIKOU)

import './views/professor/professor-app.js';
import { translationService } from './utils/translation-service.js';

/**
 * Inicializuje hlavný komponent profesorského dashboardu.
 * @param {import("firebase/auth").User} user - Objekt prihláseného používateľa z onAuthStateChanged
 */
export async function initProfessorApp(user) {
    const roleContentWrapper = document.getElementById('role-content-wrapper');
    if (!roleContentWrapper) {
        console.error("Chyba: Element 'role-content-wrapper' nebol nájdený.");
        return;
    }

    // === ZAČIATOK DIAGNOSTICKÉHO BLOKU ===
    // Tento kód overí, aké 'claims' (role) má používateľ v ID tokene.
    // Je to kľúčové pre ladenie chyby 'storage/unauthorized'.
    try {
        if (!user) {
             console.error('DIAGNOSTIKA: Funkcia initProfessorApp bola volaná bez user objektu!');
             return;
        }
        
        console.log('DIAGNOSTIKA: Overujem token pre používateľa:', user.uid);
        // Argument 'true' vynúti obnovenie tokenu priamo zo servera (kľúčové!)
        const idTokenResult = await user.getIdTokenResult(true); 
        
        console.log('=== DEKÓDOVANÝ ID TOKEN (CLAIMS) ===');
        // Použijeme JSON.stringify pre lepší a prehľadný výpis objektu
        console.log(JSON.stringify(idTokenResult.claims, null, 2));
        console.log('===================================');

        // Finálna kontrola, či rola existuje
        if (idTokenResult.claims.role === 'professor') {
            console.log('DIAGNOSTIKA: ✅ Rola "professor" NÁJDENÁ v tokene.');
        } else {
            console.warn('DIAGNOSTIKA: ❌ Rola "professor" CHÝBA v tokene!');
            console.warn('Aktuálne claims:', idTokenResult.claims);
        }
    } catch (error) {
        console.error('DIAGNOSTIKA: ‼️ Chyba pri získavaní ID tokenu:', error);
    }
    // === KONIEC DIAGNOSTICKÉHO BLOKU ===

    // Init translation
    await translationService.init();

    // Pôvodný kód na inicializáciu aplikácie
    roleContentWrapper.innerHTML = `<professor-app></professor-app>`;
    
    // Tento log sa teraz zobrazí po diagnostike
    console.log("Professor app initialized for user:", user.uid);
}
