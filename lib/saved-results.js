/** Save output before checking whether its original chat can still accept it. */
export function createResultStore({ getSettings, saveSettings, saveFile, newId }) {
    return {
        async save(result, details) {
            const url = await saveFile(result, details);
            const entry = { ...details, id: newId(), url, format: result.format, savedAt: new Date().toISOString() };
            const settings = getSettings();
            if (!Array.isArray(settings.savedResults)) settings.savedResults = [];
            settings.savedResults.push(entry);
            saveSettings();
            return entry;
        },
        attached(entry) {
            const settings = getSettings();
            settings.savedResults = (settings.savedResults || []).filter(item => item.id !== entry.id);
            saveSettings();
        },
    };
}
