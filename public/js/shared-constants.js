export const SUBMISSION_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    EVALUATED: 'evaluated',
    ERROR: 'error'
};

export const SUBMISSION_OUTCOME = {
    PASS: 'pass',
    FAIL: 'fail'
};

export const TASK_TYPE = {
    PRACTICAL: 'practical',
    THEORETICAL: 'theoretical'
};

export const TIMELINE_EVENT_TYPES = {
    TEACHER_TALK: 'teacher_talk',
    STUDENT_WORK: 'student_work',
    DISCUSSION: 'discussion',
    GROUP_WORK: 'group_work',
    ADMINISTRATION: 'administration',
    OTHER: 'other',
    TEACHER_ACTIVITY: 'teacher_activity',
    STUDENT_ACTIVITY: 'student_activity',
    ADMIN: 'admin'
};

export const EVALUATION_CHECKLIST_PHASES = {
    INTRO: 'intro',
    GOALS: 'goals',
    METHODS: 'methods',
    MATERIALS: 'materials',
    CONCLUSION: 'conclusion'
};

export const EVALUATION_STATUS = {
    YES: 'yes',
    NO: 'no',
    PARTIAL: 'partial'
};

export const OBSERVATION_QUESTIONS = [
    'goals',
    'structure',
    'methods',
    'teacher_activity',
    'student_activity',
    'materials',
    'assessment'
];
