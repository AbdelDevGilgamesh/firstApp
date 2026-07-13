---
name: calorie-tracker-product-design
description: Project-specific product design system guidance for the calorie tracker app. Use whenever Codex performs frontend implementation, React Native or Expo screen creation, UI redesign, UX improvements, reusable component design, component styling, visual consistency work, design-system work, visual audits, responsive mobile layouts, light or dark theme improvements, accessibility improvements, or prompts such as "Improve this screen", "Create a new frontend screen", "Redesign the Today page", "Make this UI more polished", "Build the Quick Log screen", "Improve the dark theme", "Create reusable UI components", or "Audit the user experience".
---

# Calorie Tracker Product Design

Use this skill for frontend design and UI/UX work in this calorie tracker project.

## Required Reference

Before making frontend, styling, UX, accessibility, theme, or design-system changes, read:

`references/design-concept.md`

Use it as the product design source of truth. Do not duplicate the whole reference in this file; apply it as practical implementation guidance.

## Design Priorities

- Make the product calm, modern, focused, and quietly encouraging.
- Treat logging food as the dominant action.
- Preserve a clear calorie and macro hierarchy.
- Make meal empty states actionable rather than judgmental.
- Use exact numbers for nutrition data.
- Use softer language for coaching and progress feedback.
- Keep daily screens compact and information-dense for repeated use.
- Use consistent reusable components, theme tokens, spacing, typography, and colors.
- Maintain accessible contrast, readable text, and 44px minimum touch targets where practical.
- Support light and dark themes.
- Build responsive layouts for different phone sizes.
- Avoid unnecessary visual decoration.
- Do not use red for missed nutrition targets.
- Treat coral as a protein accent, not an error color.

## Frontend Workflow

Before editing:

- Read `references/design-concept.md`.
- Inspect the existing screen.
- Inspect adjacent screens for established patterns.
- Inspect theme tokens, typography, spacing, and colors.
- Inspect reusable components before creating new ones.
- Inspect navigation and translations.
- Identify existing dynamic data and business logic.

During implementation:

- Use existing dynamic data instead of replacing it with mock values.
- Reuse existing components and theme tokens.
- Create reusable components only when they reduce real duplication or match existing patterns.
- Preserve loading, empty, error, and populated states.
- Preserve safe-area handling.
- Preserve accessibility labels, roles, states, and touch target quality.
- Keep visual patterns consistent across the app.
- Avoid unnecessary dependencies.
- Work on one focused screen or component group at a time.

After implementation:

- Run `npx tsc --noEmit`.
- Run `npm run check:i18n`.
- Run relevant existing tests when present.
- Report modified files and validation results.

## Behavior Protection

Do not change existing behavior unless the user explicitly asks. Preserve:

- navigation
- Supabase integration
- authentication
- database structures
- meal calculations
- calorie calculations
- macro calculations
- water tracking
- AI meal estimation
- photo scanning
- barcode scanning
- voice transcription
- persistence
- edit and delete behavior
- swipe gestures
- undo behavior
- translations
- TypeScript correctness
- i18n coverage
- theme support
- token rules

## Reference Examples

The design reference contains illustrative values such as `1,240 left`, `760 / 2,000 kcal`, and example meals.

- Treat those values as design examples only.
- Do not replace real application data with them.
- Use them only for previews, mockups, or fallback content when explicitly needed.

## Implementation Guidance

- Prefer practical nutrition-app hierarchy over decorative screens.
- Keep AI features reviewable before saving.
- Keep manual entry available.
- Use cards sparingly to group meaningful information.
- Keep primary actions visually clear and secondary actions quieter.
- Prefer reusable primitives for buttons, cards, chips, rows, inputs, and macro displays when the existing codebase supports it.
