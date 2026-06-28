# Calorie Tracker

## Generate Food Data

The app stays offline-first. It searches a local `assets/data/foods.json` file together with custom My Foods saved in AsyncStorage.

### Recommended Local Generator

This generates a reliable local food database without external API calls:

```bash
npm run generate:foods
```

Generated output:

```text
assets/data/foods.json
```

The local generator starts with 500 useful foods across common categories, cooking styles, serving units, and Moroccan foods. Nutrition values are realistic estimates for app testing and offline use.

### Optional API Import

The Open Food Facts API importer is kept in the project, but it is not the main approach because the public API can return 503/504 errors:

```bash
npm run import:foods:api
```

### Advanced JSONL Import

Use this only if you already have a local Open Food Facts JSONL dump.

1. Put the local dump here:

```text
data/openfoodfacts-products.jsonl
```

2. Run:

```bash
npm run import:foods
```

3. Generated output:

```text
assets/data/foods.json
```

The JSONL importer is limited to 5000 valid foods. It is not the default path because the full Open Food Facts dump is very large.
