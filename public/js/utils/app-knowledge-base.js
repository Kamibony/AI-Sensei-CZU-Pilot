export const APP_KNOWLEDGE_BASE = {
    general: {
        context_hint: "General overview of the AI Sensei application, roles, and navigation.",
        user_guide: `
**AI Sensei General Guide**
1. **Roles**:
   - "Professor": Creates content, manages classes, views analytics.
   - "Student": Joins classes, views lessons, completes activities.

2. **Navigation**:
   - **Dashboard**: Central hub.
   - **Library**: All created lessons.
   - **Classes**: Manage groups and students.

3. **Key Rules**:
   - Lessons must be assigned to a group.
   - Auto-save is always on.
        `,
        tour_steps: []
    },
    dashboard: {
        context_hint: "The main dashboard. Professors see creative tools and stats. Students see progress and active lessons.",
        user_guide: `
**Dashboard Guide**
- **Overview**: View your classes, recent activity, and quick actions.
- **Creative Studio (Professor)**: Quick access to Magic Generator, Manual Creation, and Library.
- **Management (Professor)**: Quick access to Students, Classes, and Analytics.
- **Student View**: See your streak, last lesson, and quick links to join classes.
        `,
        tour_steps: [
            { element: '[data-tour="dashboard-header"]', popover: { title: 'Dashboard', description: 'Welcome to your command center.' } },
            { element: '[data-tour="creative-studio"]', popover: { title: 'Creative Studio', description: 'Create lessons and media here.' } },
            { element: '[data-tour="stats-overview"]', popover: { title: 'Statistics', description: 'Quick view of your students and classes.' } },
            { element: '[data-tour="new-class-btn"]', popover: { title: 'New Class', description: 'Quickly create a new class from here.' } }
        ]
    },
    classes: {
        context_hint: "Class management view. Create/Edit classes, add students via code.",
        user_guide: `
**Classes Guide**
- **Create Class**: Use the "New Class" button.
- **Join Code**: Share the 6-character code with students.
- **Manage**: Click a class to see details or remove it.
        `,
        tour_steps: [
            { element: '[data-tour="classes-title"]', popover: { title: 'Classes', description: 'Manage all your student groups here.' } }
        ]
    },
    library: {
        context_hint: "Lesson Library. View, edit, and publish lessons.",
        user_guide: `
**Library Guide**
- **Lessons**: All your drafts and published lessons.
- **Edit**: Click to open the Editor.
- **Status**: Icons indicate if a lesson is Draft or Published.
        `,
        tour_steps: [
            { element: '[data-tour="library-title"]', popover: { title: 'Library', description: 'Your collection of lessons.' } },
            { element: '[data-tour="new-lesson-btn"]', popover: { title: 'New Lesson', description: 'Create a new lesson using AI or manually.' } },
            { element: '[data-tour="library-grid"]', popover: { title: 'Lesson Grid', description: 'View and manage all your lessons here.' } }
        ]
    },
    editor: {
        context_hint: "Lesson Editor. Supported types: Text, Quiz, Presentation, Podcast, etc. Features: AI generation.",
        user_guide: `
**Editor Guide**
- **Auto-Save**: Changes save automatically. Look for "☁️ Vše uloženo".
- **Magic Generation**: Use AI to create content from files.
- **Media**: Generate audio and images directly within the lesson.
- **Content Types**: Text, Presentation, Quiz, Test, Podcast, Comic, Flashcards, Mindmap.
        `,
        tour_steps: [
            { element: '[data-tour="editor-header"]', popover: { title: 'Editor Toolbar', description: 'Manage lesson settings and publish status.' } }
        ]
    },
    students: {
        context_hint: "Student list and profiles.",
        user_guide: `
**Students Guide**
- **List**: View all students across all classes.
- **Profile**: Click a student to see their detailed progress and portfolio.
        `,
        tour_steps: [
            { element: '[data-tour="students-title"]', popover: { title: 'Students', description: 'Overview of all enrolled students.' } },
            { element: '[data-tour="students-search"]', popover: { title: 'Search', description: 'Quickly find students by name or email.' } },
            { element: '[data-tour="students-list"]', popover: { title: 'Student List', description: 'Click on a student to view their detailed profile.' } }
        ]
    },
    practice: {
        context_hint: "Vocational Training / Practice view.",
        user_guide: `
**Practice Guide**
- **Submissions**: Upload photos of your work.
- **Feedback**: Receive AI or Professor feedback.
        `,
        tour_steps: [
            { element: '[data-tour="practice-title"]', popover: { title: 'Vocational Training', description: 'Manage real-time practical sessions.' } },
            { element: '[data-tour="practice-class-select"]', popover: { title: 'Select Class', description: 'Choose a class to start a training session.' } },
            { element: '[data-tour="practice-session-control"]', popover: { title: 'Session Control', description: 'Define tasks and monitor active sessions.' } },
            { element: '[data-tour="practice-student-grid"]', popover: { title: 'Student Progress', description: 'Watch student submissions in real-time.' } }
        ]
    },
    analytics: {
        context_hint: "Analytics view showing class performance.",
        user_guide: `
**Analytics Guide**
- **Metrics**: High-level overview of class performance.
- **Charts**: Visual trends over time.
- **Insights**: AI-driven suggestions for student improvement.
        `,
        tour_steps: [
             { element: '[data-tour="analytics-title"]', popover: { title: 'Analytics', description: 'Deep dive into student performance.' } },
             { element: '[data-tour="analytics-metrics"]', popover: { title: 'Key Metrics', description: 'High-level stats on engagement and progress.' } },
             { element: '[data-tour="analytics-charts"]', popover: { title: 'Charts', description: 'Visual trends of activity and grades.' } },
             { element: '[data-tour="analytics-insights"]', popover: { title: 'AI Insights', description: 'Auto-generated tips on who needs attention.' } }
        ]
    },
    media: {
        context_hint: "Media file management.",
        user_guide: `
**Media Guide**
- **Upload**: Upload PDF files for use in lessons.
- **Gallery**: View and manage your uploaded files.
        `,
        tour_steps: [
             { element: '[data-tour="media-title"]', popover: { title: 'Media Files', description: 'Manage your course materials (PDFs).' } },
             { element: '[data-tour="media-upload"]', popover: { title: 'Upload Area', description: 'Drag and drop files here.' } },
             { element: '[data-tour="media-files"]', popover: { title: 'File Gallery', description: 'View and manage uploaded files.' } }
        ]
    },
    "pedagogical-practice": {
        context_hint: "Pedagogical Practice Portfolio.",
        user_guide: `
**Pedagogical Practice**
- **Portfolio**: Track your teaching experience.
- **Reflection**: Add reflections on your lessons.
        `,
        tour_steps: []
    }
};

// Backward compatibility: export the full text representation for AI context injection
export const APP_KNOWLEDGE_BASE_TEXT = `
AI Sensei App Knowledge Base:

${Object.entries(APP_KNOWLEDGE_BASE).map(([key, section]) => `
--- VIEW: ${key.toUpperCase()} ---
${section.user_guide}
Context Hint: ${section.context_hint}
`).join('\n')}
`;
