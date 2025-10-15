import { storage, db } from './firebase-init.js';
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from './utils.js';

export function handleFileUpload(files, lessonId) {
    if (!files || files.length === 0 || !lessonId) {
        showToast("Nebyl vybrán žádný soubor nebo chybí ID lekce.", true);
        return;
    }

    const file = files[0];
    const storageRef = ref(storage, `lessons/${lessonId}/${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    showToast(`Nahrávám soubor: ${file.name}`);

    uploadTask.on('state_changed', 
        (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log('Upload is ' + progress + '% done');
        }, 
        (error) => {
            console.error("Upload failed:", error);
            showToast("Nahrávání souboru se nezdařilo.", true);
        }, 
        () => {
            getDownloadURL(uploadTask.snapshot.ref).then(async (downloadURL) => {
                console.log('File available at', downloadURL);
                await addFileToLesson(lessonId, file.name, downloadURL);
                showToast("Soubor byl úspěšně nahrán a přiřazen k lekci.");
            });
        }
    );
}

async function addFileToLesson(lessonId, fileName, fileURL) {
    const lessonRef = doc(db, "lessons", lessonId);
    try {
        await updateDoc(lessonRef, {
            materials: arrayUnion({
                name: fileName,
                url: fileURL,
                uploadedAt: new Date()
            })
        });
    } catch (error) {
        console.error("Error adding file to lesson document:", error);
        showToast("Nepodařilo se uložit odkaz na soubor.", true);
    }
}
