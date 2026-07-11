import { getEnabledCategoryKeywords } from '../core/config/keywordMetadata.js';

export const CATEGORY_FILES = [
    'climate-and-environment.json',
    'economic-policy.json',
    'education.json',
    'gun-policy.json',
    'healthcare-and-public-health.json',
    'immigration.json',
    'international-coverage.json',
    'lgbtq.json',
    'media-personalities.json',
    'military-and-defense.json',
    'new-developments.json',
    'political-organizations.json',
    'political-rhetoric.json',
    'political-violence-and-security-threats.json',
    'race-relations.json',
    'relational-violence.json',
    'religion.json',
    'reproductive-health.json',
    'social-policy.json',
    'us-government-institutions.json',
    'us-political-figures-full-name.json',
    'us-political-figures-single-name.json',
    'vaccine-policy.json',
    'world-leaders.json'
];

export function validateCatalogManifest(manifest) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error('Keyword catalog manifest must be an object');
    }
    if (manifest.schemaVersion !== 1 || typeof manifest.catalogVersion !== 'string') {
        throw new Error('Unsupported keyword catalog manifest');
    }
    if (!Array.isArray(manifest.categoryFiles)
        || manifest.categoryFiles.some(file => typeof file !== 'string')) {
        throw new Error('Keyword catalog manifest has an invalid category file list');
    }

    const expected = [...CATEGORY_FILES].sort();
    const actual = [...manifest.categoryFiles].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error('Keyword catalog manifest and loader category lists differ');
    }
    return manifest;
}

export async function loadDefaultKeywordCatalog() {
    const categories = await Promise.all(CATEGORY_FILES.map(async fileName => {
        const response = await fetch(chrome.runtime.getURL(`keywords/categories/${fileName}`));
        if (!response.ok) throw new Error(`Unable to load keyword category: ${fileName}`);

        const categoryData = await response.json();
        const categoryName = Object.keys(categoryData)[0];
        const category = categoryData[categoryName];
        return {
            categoryName,
            enabledKeywords: getEnabledCategoryKeywords(category),
            catalogKeywords: Object.keys(category?.keywords || {})
        };
    }));

    let manifest = null;
    let manifestError = null;
    try {
        const manifestResponse = await fetch(chrome.runtime.getURL('keywords/catalog-migrations.json'));
        if (!manifestResponse.ok) {
            throw new Error('Unable to load keyword catalog manifest');
        }
        manifest = validateCatalogManifest(await manifestResponse.json());
    } catch (error) {
        // Defaults are still useful on a first install. Existing installations
        // must preserve their stored catalog rather than run an ownership
        // migration without versioned metadata.
        manifestError = error;
        console.error('Unable to load keyword catalog migration metadata:', error);
    }

    return {
        enabledGroups: Object.fromEntries(
            categories.map(({ categoryName, enabledKeywords }) => [categoryName, enabledKeywords])
        ),
        catalogGroups: Object.fromEntries(
            categories.map(({ categoryName, catalogKeywords }) => [categoryName, catalogKeywords])
        ),
        manifest,
        manifestError
    };
}

export async function loadDefaultKeywordGroups() {
    const { enabledGroups } = await loadDefaultKeywordCatalog();
    return enabledGroups;
}
