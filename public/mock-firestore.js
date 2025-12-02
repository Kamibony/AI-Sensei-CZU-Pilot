export const collection = () => {};
export const query = () => {};
export const where = () => {};
export const onSnapshot = (ref, onNext, onError) => {
    // Determine what to return based on ref or just return dummy data
    // For student profile:
    if (onNext) onNext({
        exists: () => true,
        data: () => ({ memberOfGroups: ['group1'], streak: 42 }),
        empty: false,
        docs: [{ id: 'lesson1', data: () => ({ title: 'Hero Lesson', subtitle: 'Subtitle' }) }]
    });
    return () => {};
};
export const doc = () => ({});
export const getDoc = async () => ({
    exists: () => true,
    data: () => ({ name: 'Test Group', ownerName: 'Prof. X' }),
    id: 'group1'
});
export const orderBy = () => {};
export const updateDoc = async () => {};
export const arrayUnion = () => {};
export const getDocs = async () => ({ empty: true, docs: [] });
export const setDoc = async () => {};
