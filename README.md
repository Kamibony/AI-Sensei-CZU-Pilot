# AI Sensei - Intelligent Educational Platform (v1.0.0)

AI Sensei is a comprehensive educational platform that leverages AI to support professors and engage students.

## Active Modules

*   **Architect:** Intelligent Knowledge Graph and competency mapping from syllabi.
*   **Generator:** AI-powered content generation (lessons, quizzes, podcasts, comics).
*   **Observer:** Real-time classroom audio analysis and pedagogical metrics.
*   **PBL/CBL Engine:** Project-Based Learning management with crisis injection scenarios.
*   **Research Engine:** Deep analytics and anonymized data export for educational research.

## Deployment

### Service Account Key Workflow

This project uses GitHub Actions for deployment to Firebase.
To deploy successfully, you must configure the Google Cloud Service Account Key:

1.  **Generate Key:** Go to Google Cloud Console -> IAM & Admin -> Service Accounts. Create a key (JSON) for the Firebase Service Account.
2.  **Encode Key:** Base64 encode the JSON key file.
    ```bash
    base64 -w 0 service-account.json > service-account.b64
    ```
3.  **GitHub Secret:** Add the Base64 string as a secret named `GCP_SA_KEY` in your GitHub repository settings.
4.  **Workflow:** The `.github/workflows/deploy.yml` workflow will automatically decode this secret into `GCP_SA_KEY_B64` and use it for authentication.

## Development

The frontend is a static site in `public/`.
The backend uses Firebase Cloud Functions in `functions/`.

### Prerequisites
*   Node.js 20+
*   Firebase CLI

### Running Locally
1.  Serve frontend: `python3 -m http.server` in root.
2.  Serve backend: `cd functions && npm run serve`.
