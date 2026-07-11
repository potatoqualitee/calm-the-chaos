# Keyword lifecycle and catalog updates

The catalog separates durable subject matter from things that naturally expire. Entries without lifecycle metadata are treated as evergreen for backward compatibility.

- **Evergreen**: policy concepts, institutions, constitutional processes, and durable conflict language. Membership is stable; weights can still change.
- **Cyclical**: recurring countries, crises, elections, disasters, and pandemic language. Keep the term in the catalog and adjust its weight instead of deleting and re-adding it every news cycle.
- **Tenure**: officeholders, political figures, and media personalities. Review at least quarterly and retire when sustained relevance ends.
- **Event**: an incident, victim, suspect, trial, transition, operation, or headline phrase with a required `reviewAfter` date. On that date a curator must keep it with a new date, move it, or retire it; clients never silently delete it.

Events that must ship reliably to both clients stay in their relevant durable category with per-entry event metadata; the volatile New Developments feed may be replaced wholesale. Weight controls the default filtering tier. It is not identity or lifecycle. A move between categories, case-only edit, or weight change is therefore not a retirement.

## User-safe migrations

The keywords/catalog-migrations.json manifest is append-only. Clients use its stable version and explicit changes rather than guessing that simultaneous remove/add operations are synonyms.

When a default is removed:

1. A disabled inherited default retires normally.
2. An individually re-enabled (pinned) default moves to Custom Keywords with retired-default provenance.
3. An enabled inherited default enters **Retired Curated Keywords**. Filtering continues while the user chooses **Keep** or **Remove**; it is never silently claimed as user-authored.
4. A category move or weight change does nothing to ownership.
5. A declared rename carries opt-in/opt-out state to the new spelling.

The full catalog snapshot includes weight-zero metadata. This prevents a priority reduction from looking like a removal. Imported user groups remain separate from authoritative bundled groups.
