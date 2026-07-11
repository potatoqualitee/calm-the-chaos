/**
 * Return the keywords that should be enabled by default for a category.
 * Weight zero is metadata-only and intentionally excluded from default filtering.
 */
export function getEnabledCategoryKeywords(categoryData) {
    if (!categoryData || typeof categoryData !== 'object') {
        return [];
    }

    const keywords = categoryData.keywords || {};
    return Object.entries(keywords)
        .filter(([, metadata]) => Number(metadata?.weight ?? 1) > 0)
        .map(([keyword]) => keyword);
}
