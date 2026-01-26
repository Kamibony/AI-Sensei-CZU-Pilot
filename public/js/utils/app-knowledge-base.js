export const KNOWLEDGE_BASE = {
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
            { element: 'header h1', popover: { title: 'Dashboard', description: 'Welcome to your command center.' } },
            { element: '[data-tour="creative-studio"]', popover: { title: 'Creative Studio', description: 'Create lessons and media here.' } },
            { element: '[data-tour="stats-overview"]', popover: { title: 'Statistics', description: 'Quick view of your students and classes.' } }
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
            { element: 'professor-classes-view h2', popover: { title: 'Classes', description: 'Manage all your student groups here.' } }
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
            { element: 'professor-library-view h2', popover: { title: 'Library', description: 'Your collection of lessons.' } }
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
            { element: 'lesson-editor header', popover: { title: 'Editor Toolbar', description: 'Manage lesson settings and publish status.' } }
        ]
    },
    students: {
        context_hint: "Student list and profiles.",
        user_guide: `
**Students Guide**
- **List**: View all students across all classes.
- **Profile**: Click a student to see their detailed progress and portfolio.
        `,
        tour_steps: []
    },
    practice: {
        context_hint: "Vocational Training / Practice view.",
        user_guide: `
**Practice Guide**
- **Submissions**: Upload photos of your work.
- **Feedback**: Receive AI or Professor feedback.
        `,
        tour_steps: []
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

// Backward compatibility: maintain the original string export but populate it from the object to keep it "living"
// or just re-export the original static text if we want to be strictly non-destructive to the *value*
// (though the prompt implies "Convert this", so changing the value is expected).
// We will construct a string that mimics the old one plus new info.

export const APP_KNOWLEDGE_BASE = `
AI Sensei App Knowledge Base:

${Object.entries(KNOWLEDGE_BASE).map(([key, section]) => `
--- VIEW: ${key.toUpperCase()} ---
${section.user_guide}
Context Hint: ${section.context_hint}
`).join('\n')}
`;
