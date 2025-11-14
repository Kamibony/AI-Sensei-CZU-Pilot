# Analýza a Odporúčania

Tento dokument sumarizuje zistenia a odporúčané kroky pre problémy, ktoré nebolo možné plne vyriešiť priamou úpravou kódu v dostupných súboroch.

## Problém 2: Študent dostáva chybu 403 pri načítaní placeholder obrázku

**Stav:**
Príčina problému, ktorou boli nesprávne pravidlá v `storage.rules`, bola **vyriešená**. Bol vytvorený nový, verejne čitateľný adresár `public-assets/`.

**Zistenie:**
Počas analýzy sa nepodarilo nájsť presný súbor, v ktorom je použitá cesta k obrázku `courses/main-course/media/student_profile_placeholder.png`. Prehľadal som všetky relevantné JavaScriptové súbory (`student-lesson-list.js`, `student.js`, `professor-student-profile-view.js` a ďalšie) bez úspechu. Toto naznačuje, že cesta je pravdepodobne definovaná v súbore, ku ktorému nemám prístup (napr. CSS, iný HTML súbor, alebo je súčasťou build procesu).

**Odporúčanie:**
1.  **Manuálne presuňte** súbor `student_profile_placeholder.png` z pôvodného umiestnenia `courses/main-course/media/` do nového, verejného adresára `public-assets/`.
2.  **Nájdite a aktualizujte** v kóde referenciu na tento súbor. Nová cesta by mala byť `/public-assets/student_profile_placeholder.png`.

---

## Problém 3: Študent nevidí žiadne lekcie

**Stav:**
Problém bol analyzovaný a bolo potvrdené, že sa **nejedná o chybu v kóde**.

**Zistenie:**
Logika na strane klienta (`student-lesson-list.js`) a na strane servera (Cloud Funkcia `getStudentLessons`) je implementovaná správne. Študentovi sa zobrazia iba lekcie priradené skupinám, ktorých je členom. Členstvo v skupinách je uložené v poli `memberOfGroups` v dokumente študenta v kolekcii `/students/{uid}`.

Ďalej sa zistilo, že v profesorskej časti aplikácie **neexistuje funkčnosť na manuálne priradenie študenta do skupiny**. Jediný spôsob, ako sa študent môže stať členom skupiny, je, že sám použije prístupový kód (`joinCode`), ktorý mu poskytne profesor. Tento proces spúšťa Cloud Funkciu `joinClass`, ktorá, ako bolo overené, funguje správne a atomicky aktualizuje dáta študenta aj skupiny.

**Záver:**
Hlásenie "Zatím nejste v žádné třídě" je pre testovacieho študenta zobrazené správne, pretože jeho dokument v databáze neobsahuje pole `memberOfGroups` alebo je toto pole prázdne.

**Odporúčanie:**
Pre otestovanie funkčnosti stačí, ak sa s testovacím študentským účtom pripojíte do existujúcej triedy pomocou jej prístupového kódu. Tým sa naplnia potrebné dáta a lekcie sa zobrazia. **Nie je potrebná žiadna oprava kódu.**
