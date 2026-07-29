// Reads the permanent keyword catalog straight off disk. This module exists
// because the engine used to fetch these lists over the network and publish
// with NO exclusions when that fetch failed, flooding every user's mute list
// with permanently-muted names. A local read cannot fail that way.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const CATEGORY_NAME = 'New Developments';

async function readJson(filePath) {
    return JSON.parse(await readFile(filePath, 'utf8'));
}

// catalog-migrations.json is the authoritative list of category files and is
// already covered by the repo's own manifest-alignment test.
async function categoryFiles(keywordsDir) {
    const manifest = await readJson(path.join(keywordsDir, 'catalog-migrations.json'));
    if (!Array.isArray(manifest.categoryFiles) || manifest.categoryFiles.length === 0) {
        throw new Error('catalog-migrations.json has no categoryFiles list');
    }
    return manifest.categoryFiles;
}

export async function readCatalogKeywords(keywordsDir) {
    const keywords = new Set();
    for (const file of await categoryFiles(keywordsDir)) {
        // A missing or malformed file throws: a partial exclusion set is the
        // exact failure mode this module exists to prevent.
        const data = await readJson(path.join(keywordsDir, 'categories', file));
        const category = data[Object.keys(data)[0]];
        for (const keyword of Object.keys(category?.keywords || {})) {
            keywords.add(keyword.toLowerCase());
        }
    }
    return keywords;
}

export async function readCuratedNewDevelopments(keywordsDir) {
    const data = await readJson(path.join(keywordsDir, 'categories', 'new-developments.json'));
    const category = data[CATEGORY_NAME];
    const curated = {};
    for (const [keyword, meta] of Object.entries(category?.keywords || {})) {
        // Weight 0 means catalog-only reference metadata; consumers filter it
        // out anyway, so it must not occupy a published slot.
        if (Number(meta?.weight ?? 0) <= 0) continue;
        curated[keyword] = { weight: meta.weight, description: meta.description };
    }
    return curated;
}
