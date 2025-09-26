const admin = require('firebase-admin');

// ================== KROK 1: KONFIGURACE ==================
const serviceAccount = require('./serviceAccountKey.json');

// Nastavení pro připojení k emulátorům, pokud běží lokálně
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.log(`Připojuji se k LOKÁLNÍMU Firestore emulátoru na: ${process.env.FIRESTORE_EMULATOR_HOST}`);
  admin.initializeApp({
    projectId: serviceAccount.project_id,
    credential: admin.credential.cert(serviceAccount),
  });
} else {
  console.log("Připojuji se k PRODUKČNÍ Firestore databázi.");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// ================== KROK 2: VZOROVÁ DATA ==================
const lessonsData = [
  {
    title: 'Úvod do Kvantové Fyziky',
    subtitle: 'Základní principy',
    icon: '⚛️',
    status: 'Aktivní',
    creationDate: new Date('2025-09-20T10:00:00Z')
  },
  {
    title: 'Historie Starověkého Říma',
    subtitle: 'Od republiky k císařství',
    icon: '🏛️',
    status: 'Aktivní',
    creationDate: new Date('2025-09-18T14:00:00Z')
  },
  {
    title: 'Základy botaniky',
    subtitle: 'Fotosyntéza a růst',
    icon: '🌱',
    status: 'Naplánováno',
    creationDate: new Date('2025-09-15T09:00:00Z')
  },
  {
    title: 'Shakespearova dramata',
    subtitle: 'Tragédie a komedie',
    icon: '🎭',
    status: 'Archivováno',
    creationDate: new Date('2025-09-12T11:00:00Z')
  }
];

// ================== KROK 3: SPUŠTĚNÍ SKRIPTU ==================
async function seedDatabase() {
  const lessonsCollection = db.collection('lessons');
  console.log('Zahajuji naplňování databáze...');

  for (const lesson of lessonsData) {
    try {
      await lessonsCollection.add(lesson);
      console.log(`✅ Přidána lekce: ${lesson.title}`);
    } catch (error) {
      console.error(`❌ Chyba při přidávání lekce: ${lesson.title}`, error);
    }
  }

  console.log('\nNaplňování databáze dokončeno!');
}

seedDatabase();