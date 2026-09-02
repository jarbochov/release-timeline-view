# Release Timeline for Obsidian Bases

This plugin renders release-style timelines as a custom [Obsidian Bases](https://help.obsidian.md/bases) view.

It no longer depends on Dataview. Create a Base, filter the notes you want, and select the `Release Timeline` custom view for that Base.

This project is based on the original release timeline plugin by cakechaser and has been adapted for native Obsidian Bases support.

## How to use

### 1. Store a date in note properties

Add a date property to the notes that will feed the Base. The plugin accepts:

- `2022`
- `2022-12`
- `2022-12-31`

### 2. Create a Base and select the custom view

Example `.base` file:

```yaml
filters:
  and:
    - note.releaseDate
views:
  - type: release-timeline
    name: Release Timeline
    mode: year
    dateProperty: note.releaseDate
    labelProperty: file.name
    sortDirection: desc
```

View settings:

- `mode`: `year`, `month`, or `week`
- `sortDirection`: `asc` or `desc`
- `bulletPoints`: show bullets for multi-item periods
- `itemLayout`: `stacked` for one item per line, or `inline` for comma-separated entries
- `collapseEmptyYears`: compress long runs of empty years in year mode
- `collapseLimit`: minimum empty-year run length to collapse
- `collapseEmptyMonths`: reduce empty months in week mode
- `weekDisplayFormat`: `weekNames` (`W15`), `dateNames` (`2025-08-19`), or `monthDayRange` (`Feb 13-20`)
- `accentAlternationMode`: `none`, `year`, `month`, or `both`
- `widthPx`: set the rendered view width in pixels
- color pickers for the primary and alternate accent colors so embeds can match the original wiki-like styling

Note: note titles open on click and show hover previews on hover.

## Quick compile and test

```bash
npm run verify
```

That command builds the plugin and runs a smoke test against the timeline core.
