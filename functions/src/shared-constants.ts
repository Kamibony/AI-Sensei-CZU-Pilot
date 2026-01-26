export const SUBMISSION_STATUS = {
    PENDING: "pending",
    PROCESSING: "processing",
    EVALUATED: "evaluated",
    ERROR: "error"
};

export const SUBMISSION_OUTCOME = {
    PASS: "pass",
    FAIL: "fail"
};

export const TASK_TYPE = {
    PRACTICAL: "practical",
    THEORETICAL: "theoretical"
};

export const TIMELINE_EVENT_TYPES = {
    TEACHER_TALK: "teacher_talk",
    STUDENT_WORK: "student_work",
    DISCUSSION: "discussion",
    GROUP_WORK: "group_work",
    ADMINISTRATION: "administration",
    OTHER: "other"
};

export const EVALUATION_CHECKLIST_PHASES = {
    INTRO: "intro",
    GOALS: "goals",
    METHODS: "methods",
    MATERIALS: "materials",
    CONCLUSION: "conclusion"
};

export const EVALUATION_STATUS = {
    YES: "yes",
    NO: "no",
    PARTIAL: "partial"
};

// TypeScript Interfaces

export interface TimelineEvent {
    type: string; // One of TIMELINE_EVENT_TYPES
    timestamp: number; // Unix timestamp or offset in seconds
    duration?: number; // Duration in seconds (optional, if calculated later)
    note?: string;
}

export interface ObservationMetadata {
    school: string;
    teacher: string;
    subject: string;
    topic: string;
    goals: string;
    grade: string;
    date: number; // Unix timestamp
}

export interface Observation {
    id?: string;
    studentId: string;
    type: "observation"; // Discriminator
    metadata: ObservationMetadata;
    qualitative_answers: {
        [questionId: string]: string; // 7 didactic questions
    };
    timeline: TimelineEvent[];
    // Computed stats
    teacherTimePercentage?: number;
    studentTimePercentage?: number;
    createdAt: number;
    updatedAt: number;
}

export interface EvaluationChecklist {
    [phase: string]: string; // One of EVALUATION_STATUS values, keys from EVALUATION_CHECKLIST_PHASES
}

export interface Analysis {
    id?: string;
    studentId: string;
    observationId?: string; // Link to the observation being analyzed (optional if standalone)
    type: "analysis"; // Discriminator
    checklist: EvaluationChecklist;
    bloomsTaxonomyVerbs: string[]; // List of identified verbs
    bloomsLevelEvaluation: string; // Qualitative assessment of Bloom's level
    createdAt: number;
    updatedAt: number;
}

export interface Portfolio {
    id?: string;
    studentId: string;
    type: "portfolio";
    linkedObservationIds: string[];
    linkedAnalysisIds: string[];
    swot: {
        strengths: string[];
        weaknesses: string[];
        opportunities?: string[];
        threats?: string[];
    };
    selfReflection: string;
    createdAt: number;
    updatedAt: number;
}
