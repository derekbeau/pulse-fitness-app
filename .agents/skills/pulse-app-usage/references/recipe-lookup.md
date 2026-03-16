# Recipe Lookup (Pulse)

Use this when the meal is homemade and may already exist in Obsidian recipe notes.

## Path

- Recipes root: `~/Obsidian/Master/2-Areas/Family Meals/Recipes/`

## Workflow

1. Search recipe files by name/keyword.
2. If found, read nutrition section (frontmatter or table) and extract per-serving macros.
3. Convert serving-based values to consumed amount.
4. Create the food in Pulse via `POST /api/v1/foods/` with `source: "recipe"` and relevant notes.
5. Log the meal via `POST /api/v1/meals/` referencing the newly created food.

## Search command

```bash
find ~/Obsidian/Master/2-Areas/Family\ Meals/Recipes -iname '*keyword*'
```

## Fallback

If no recipe entry is found, use `references/macro-lookup.md` source hierarchy.
