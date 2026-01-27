export function collection() { return {}; }
export function query() { return {}; }
export function where() { return {}; }
export function doc() { return {}; }
export function getDocs() {
    return Promise.resolve({
        docs: [
            { id: 'class1', data: () => ({ name: 'Class A' }) },
            { id: 'class2', data: () => ({ name: 'Class B' }) }
        ]
    });
}
export function onSnapshot(ref, callback) {
    // Simulate report arrival
    setTimeout(() => {
        callback({
            exists: () => true,
            data: () => ({
                generatedAt: { toDate: () => new Date() },
                metrics: {
                    behavioral: { avgCrisisResolutionSeconds: 45 },
                    cognitive: {
                        knowledgeHeatmap: [
                            { topic: "Topic A", failureRate: 60 },
                            { topic: "Topic B", failureRate: 20 }
                        ]
                    }
                }
            })
        });
    }, 500);
    return () => {};
}
