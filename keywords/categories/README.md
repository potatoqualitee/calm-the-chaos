# Categories Directory

This directory contains JSON files that define keyword categories. Each category represents a distinct topic area that generates significant public discourse.

## File Structure

Each category file follows this structure:
```json
{
  "Category Name": {
    "description": "Category description",
    "keywords": {
      "term": {
        "weight": 0-3,
        "description": "Term description"
      }
    }
  }
}
```

## Weight System

Weights are the default filtering tier, not a measure of identity or lifecycle:

- 3: highest-priority default
- 2: strong default
- 1: regular default
- 0: metadata/Complete-only; excluded from the extension's default matcher

## Lifecycle System

- evergreen: durable policy, institution, and process vocabulary
- cyclical: recurring crises, elections, geography, and named policies whose priority changes
- tenure: people and organizations reviewed at least every 90 days
- event: short-lived incidents reviewed on an explicit `reviewAfter` date; review never silently deletes a term

Category-level lifecycle is the default; missing lifecycle metadata is treated as evergreen, and individual keywords may override it. See ../../docs/keyword-lifecycle.md and ../catalog-migrations.json.

## Special Categories

### New Developments
`new-developments.json` is a volatile remote-fed category and may be replaced wholesale. Events that must ship reliably to both clients live in their relevant durable category with `lifecycle: "event"` and an explicit `reviewAfter` date.

### World Leaders
`world-leaders.json` keeps current tenure-based leaders at weight 0. A former leader who is still driving a major event may temporarily override weight and lifecycle until an explicit `reviewAfter` decision.

### Political Figures
Canonical full names and safe aliases are tracked separately. Ambiguous aliases may have lower weights than the canonical name, but never a higher weight.

## Maintenance Guidelines

1. Weight Distribution
   - Regularly audit weight distributions within categories
   - Maintain target percentages while preserving appropriate weights for critical terms
   - Consider both frequency and polarization when assigning weights

2. Updates
   - Monitor `new-developments.json` for emerging figures and stories
   - Graduate terms to permanent categories when appropriate
   - Keep political figure weights consistent across full/single name files
   - Maintain weight 0 for world leaders

3. Adding New Terms
   - Place in most relevant category
   - Assign initial weight based on current impact and polarization
   - Add a single-name alias only when it is safe and reasonably unambiguous
   - Include clear, consistent descriptions

4. File Organization
   - Maintain alphabetical order within files
   - Keep descriptions concise and factual
   - Ensure JSON validity
   - Include both common variants of terms where applicable

## Performance Considerations

The weight system enables smart selection at different scales:
- 100 keywords: Highest weights only
- 300 keywords: High and frequent terms
- 500 keywords: Include common terms
- 1200 keywords: Comprehensive coverage

This graduated system helps optimize performance while maintaining effectiveness at various scales.
