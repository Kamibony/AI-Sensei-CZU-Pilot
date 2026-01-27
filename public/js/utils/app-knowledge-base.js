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
            { element: '[data-tour="students-title"]', popover: { title: 'Students', description: 'Manage your student roster here.' } }
        ]
    },
    analytics: {
        context_hint: "Analytics view for tracking student and class performance.",
        user_guide: `
**Analytics Guide**
- **Charts**: View activity and grade distributions.
- **Metrics**: Track reach, engagement, and knowledge mastery.
- **Insights**: Identify students who need help or are excelling.
        `,
        tour_steps: [
            { element: '[data-tour="analytics-title"]', popover: { title: 'Analytics', description: 'View insights about class performance.' } }
        ]
    },
    media: {
        context_hint: "Media management view for uploading and managing course files.",
        user_guide: `
**Media Guide**
- **Upload**: Drag and drop files to upload.
- **Manage**: View, delete, and organize your uploaded files.
        `,
        tour_steps: [
            { element: '[data-tour="media-title"]', popover: { title: 'Media', description: 'Upload and manage course files.' } }
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
             { element: '[data-tour="practice-title"]', popover: { title: 'Vocational Training', description: 'Manage and review student practice submissions.' } }
        ]
    },
    "pedagogical-practice": {
        context_hint: "Pedagogical Practice Portfolio.",
        user_guide: `
**Pedagogical Practice**
- **Portfolio**: Track your teaching experience.
- **Reflection**: Add reflections on your lessons.
        `,
        tour_steps: [
            { element: '[data-tour="pedagogical-practice-start"]', popover: { title: 'Pedagogical Practice', description: 'Manage your portfolio and reflections.' } }
        ]
    },
    interactions: {
        context_hint: "Student-Professor communication hub.",
        user_guide: `
**Interactions Guide**
- **Chat**: Communicate with students directly.
- **AI Assist**: Use AI to draft replies.
        `,
        tour_steps: [
            { element: '[data-tour="interactions-start"]', popover: { title: 'Interactions', description: 'Communicate with your students here.' } }
        ]
    },
    architect: {
        context_hint: "Curriculum Architect for visualizing competency graphs.",
        user_guide: `
**Architect Guide**
- **Upload**: Upload a PDF syllabus.
- **Map**: Visualize the competency graph (Bloom/EQF).
        `,
        tour_steps: [
            { element: '[data-tour="architect-start"]', popover: { title: 'Architect', description: 'Visualize and analyze your curriculum structure.' } }
        ]
    },
    observer: {
        context_hint: "AI Classroom Observer for real-time analysis.",
        user_guide: `
**Observer Guide**
- **Record**: Start recording a lesson.
- **Analyze**: Get real-time feedback on talk ratio and tone.
        `,
        tour_steps: [
            { element: '[data-tour="observer-start"]', popover: { title: 'AI Observer', description: 'Real-time classroom analysis tool.' } }
        ]
    },
    planner: {
        context_hint: "Lesson Planner and Calendar.",
        user_guide: `
**Planner Guide**
- **Calendar**: Drag and drop lessons to schedule them.
- **Backlog**: View unscheduled lessons.
        `,
        tour_steps: [
            { element: '[data-tour="timeline-start"]', popover: { title: 'Planner', description: 'Schedule your lessons and manage your timeline.' } }
        ]
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
