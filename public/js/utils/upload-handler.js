import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { collection, addDoc, doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { storage, db, functions, auth } from '../firebase-init.js';

export async function uploadMultipleFiles(files, courseId, onProgress) {
    const successful = [];
    const failed = [];

    for (const file of files) {
        try {
            const result = await uploadSingleFile(file, courseId, onProgress);
            successful.push(result);
        } catch (error) {
            console.error(`Failed to upload ${file.name}:`, error);
            failed.push({ file, error });
        }
    }

    return { successful, failed };
}

export async function uploadSingleFile(file, courseId, onProgress) {
    // 1. Get Secure Upload URL (and create metadata doc)
    const getSecureUploadUrl = httpsCallable(functions, 'getSecureUploadUrl');

    // Determine storage path based on courseId (or professor ID)
    // If courseId is 'main-course', we might use a generic path or user-specific.
    // The backend function usually enforces the path structure.
    // Let's assume we pass minimal info and backend decides.

    const { data } = await getSecureUploadUrl({
        fileName: file.name,
        contentType: file.type,
        courseId: courseId, // Metadata
        size: file.size // Include file size for Firestore metadata
    });

    const { uploadUrl, fileId, storagePath } = data;

    // 2. Upload to Storage via PUT to signed URL
    // Note: This bypasses Firebase SDK uploadBytesResumable for the actual transfer if using signed URL,
    // BUT the requirement mentions "v4 Signed URL architecture".
    // If we use signed URL, we use fetch PUT.

    await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
                const percent = (e.loaded / e.total) * 100;
                onProgress(percent);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                reject(new Error(`Upload failed with status ${xhr.status}`));
            }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));

        xhr.send(file);
    });

    // 3. Finalize Upload (notify backend to update metadata)
    const finalizeUpload = httpsCallable(functions, 'finalizeUpload');
    await finalizeUpload({ fileId });

    // Return info needed for UI
    return {
        fileId,
        fileName: file.name,
        storagePath,
        url: uploadUrl.split('?')[0] // Approximation, or we fetch a read-URL later
    };
}

export async function processFileForRAG(fileId) {
    const processFunc = httpsCallable(functions, 'processFileForRAG');
    const result = await processFunc({ fileId });
    return result.data;
}
