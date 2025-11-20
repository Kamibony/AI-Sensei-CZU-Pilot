const pdf = require('pdf-parse');
console.log("pdf-parse required successfully");

try {
    const gemini = require('./lib/gemini-api.js');
    console.log("gemini-api required successfully");
} catch (e) {
    console.error("Failed to require gemini-api:", e);
}

// Mock environment variables for gemini-api functions
process.env.GCLOUD_PROJECT = "test-project";
process.env.STORAGE_BUCKET = "test-bucket";
