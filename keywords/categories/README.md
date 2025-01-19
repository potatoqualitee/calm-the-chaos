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

These keywords were weighted by Sonnet 3.5 using Cline in VS Code.

### Category Weights
- Weight 9-10: High-intensity topics (e.g., Race Relations, Reproductive Health)
- Weight 8: Significant topics (e.g., Social Policy)
- Weight 7: Important topics (e.g., US Government Institutions)

### Keyword Weights
Keywords within each category follow this distribution:
- Weight 8-10: ~15% (most critical terms)
  * 10: Reserved for presidents and highest impact terms
  * Highly polarizing figures and critical policy terms
  * Frequent, significant terms
- Weight 7: ~25% (frequently discussed terms)
- Weight 6: ~30% (common terms)
- Weight 5 and below: ~30% (regular and basic terms)

## Special Categories

### New Developments
`new-developments.json` tracks emerging political figures and developing stories. Terms may graduate to permanent categories as their significance stabilizes.

### World Leaders
`world-leaders.json` maintains a list of international leaders with weight 0 to exclude them from muting while preserving their reference information for easy muting.

### Political Figures
Both full names (`us-political-figures-full-name.json`) and single names (`us-political-figures-single-name.json`) are tracked separately with consistent weights across both files.

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
   - Add to both name variants if a political figure
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
