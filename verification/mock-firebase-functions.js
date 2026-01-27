export function httpsCallable(funcs, name) {
    return async (data) => {
        console.log(`Call function ${name}`, data);
        if (name === 'generateClassReport') return { success: true };
        if (name === 'exportAnonymizedData') return { data: { url: 'http://example.com/export.json' } };
        return {};
    };
}
