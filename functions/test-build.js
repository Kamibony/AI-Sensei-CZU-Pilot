
process.env.GCLOUD_PROJECT = "test-project";
process.env.FIREBASE_CONFIG = '{}';

try {
  const index = require('./lib/index.js');
  console.log("Successfully imported index.js");
} catch (e) {
  console.error("Failed to import index.js:", e);
  process.exit(1);
}
