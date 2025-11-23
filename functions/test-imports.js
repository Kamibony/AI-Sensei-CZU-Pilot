process.env.GCLOUD_PROJECT = "test-project";
process.env.GCP_PROJECT = "test-project";
process.env.GOOGLE_CLOUD_PROJECT = "test-project";

try {
  console.log("Attempting to require ./lib/index.js...");
  require("./lib/index.js");
  console.log("Successfully required ./lib/index.js");
} catch (error) {
  console.error("Failed to require ./lib/index.js:");
  console.error(error);
}
