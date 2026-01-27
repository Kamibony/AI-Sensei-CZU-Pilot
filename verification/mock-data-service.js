export class ProfessorDataService {
    async getAdvancedAnalytics() {
        return {
            metrics: {
                totalReach: { value: 10, trend: "Aktivní", explanation: "Expl" },
                engagementScore: { value: "80%", trend: "Good", explanation: "Expl" },
                knowledgeMastery: { value: "70%", trend: "Avg", explanation: "Expl" },
                contentVelocity: { value: 5, trend: "Fast", explanation: "Expl" }
            },
            charts: {
                activity: [1,2,3,4,5,6,7,8,9,10,11,12,13,14],
                grades: [5,4,3,2,1]
            },
            insights: { needsAttention: [], topPerformers: [] },
            meta: { lastUpdated: new Date().toISOString() }
        };
    }
}
