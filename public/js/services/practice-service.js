import { db } from '../firebase-init.js';
import {
    collection,
    addDoc,
    updateDoc,
    doc,
    getDocs,
    getDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { TIMELINE_EVENT_TYPES } from '../shared-constants.js';

export class PracticeService {
    constructor() {
        this.collectionName = 'pedagogical_practice';
    }

    /**
     * Creates a new Observation record.
     * @param {Object} data - Observation data conforming to the schema.
     * @returns {Promise<string>} - The ID of the created document.
     */
    async createObservation(data) {
        try {
            const docRef = await addDoc(collection(db, this.collectionName), {
                ...data,
                type: 'observation',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                timeline: data.timeline || [] // Initialize timeline if not provided
            });
            console.log("Observation created with ID: ", docRef.id);
            return docRef.id;
        } catch (e) {
            console.error("Error creating observation: ", e);
            throw e;
        }
    }

    /**
     * Logs a timeline event to an existing observation in real-time.
     * @param {string} observationId
     * @param {string} type - One of TIMELINE_EVENT_TYPES
     * @param {Object} extraData - Optional note or duration
     */
    async logTimelineEvent(observationId, type, extraData = {}) {
        if (!Object.values(TIMELINE_EVENT_TYPES).includes(type)) {
            throw new Error(`Invalid timeline event type: ${type}`);
        }

        const event = {
            type,
            timestamp: Date.now(),
            ...extraData
        };

        try {
            const observationRef = doc(db, this.collectionName, observationId);
            await updateDoc(observationRef, {
                timeline: arrayUnion(event),
                updatedAt: serverTimestamp()
            });

            // Recalculate stats? Or do it on read/analysis.
            // For now, just logging.
            return event;
        } catch (e) {
            console.error("Error logging timeline event: ", e);
            throw e;
        }
    }

    /**
     * Creates a new Analysis record.
     * @param {Object} data - Analysis data.
     */
    async createAnalysis(data) {
        try {
            const docRef = await addDoc(collection(db, this.collectionName), {
                ...data,
                type: 'analysis',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            return docRef.id;
        } catch (e) {
            console.error("Error creating analysis: ", e);
            throw e;
        }
    }

    /**
     * Generates (or updates) a Portfolio for a student by linking all their observations and analyses.
     * @param {string} studentId
     */
    async generatePortfolio(studentId) {
        try {
            // 1. Fetch all Observations
            const obsQuery = query(
                collection(db, this.collectionName),
                where('studentId', '==', studentId),
                where('type', '==', 'observation')
            );
            const obsSnapshot = await getDocs(obsQuery);
            const observationIds = obsSnapshot.docs.map(doc => doc.id);

            // 2. Fetch all Analyses
            const analysisQuery = query(
                collection(db, this.collectionName),
                where('studentId', '==', studentId),
                where('type', '==', 'analysis')
            );
            const analysisSnapshot = await getDocs(analysisQuery);
            const analysisIds = analysisSnapshot.docs.map(doc => doc.id);

            // 3. Check if Portfolio exists
            const portfolioQuery = query(
                collection(db, this.collectionName),
                where('studentId', '==', studentId),
                where('type', '==', 'portfolio')
            );
            const portfolioSnapshot = await getDocs(portfolioQuery);

            let portfolioId;

            if (!portfolioSnapshot.empty) {
                // Update existing
                const docRef = portfolioSnapshot.docs[0].ref;
                portfolioId = docRef.id;
                await updateDoc(docRef, {
                    linkedObservationIds: observationIds,
                    linkedAnalysisIds: analysisIds,
                    updatedAt: serverTimestamp()
                });
            } else {
                // Create new
                const docRef = await addDoc(collection(db, this.collectionName), {
                    studentId,
                    type: 'portfolio',
                    linkedObservationIds: observationIds,
                    linkedAnalysisIds: analysisIds,
                    swot: { strengths: [], weaknesses: [] }, // Default
                    selfReflection: "",
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
                portfolioId = docRef.id;
            }

            return portfolioId;
        } catch (e) {
            console.error("Error generating portfolio: ", e);
            throw e;
        }
    }

    /**
     * Fetches all observations for a student.
     * @param {string} studentId
     */
    async getObservations(studentId) {
        const q = query(
            collection(db, this.collectionName),
            where('studentId', '==', studentId),
            where('type', '==', 'observation'),
            orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    /**
     * Fetches all analyses for a student.
     * @param {string} studentId
     */
    async getAnalyses(studentId) {
        const q = query(
            collection(db, this.collectionName),
            where('studentId', '==', studentId),
            where('type', '==', 'analysis'),
            orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    /**
     * Fetches the portfolio for a student.
     * @param {string} studentId
     */
    async getPortfolio(studentId) {
        const q = query(
            collection(db, this.collectionName),
            where('studentId', '==', studentId),
            where('type', '==', 'portfolio')
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    }
}
