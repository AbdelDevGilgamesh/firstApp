# Calorie Tracker Product Design Concept

## Product Direction

The app should feel like a premium, modern, calm calorie tracker focused on fast logging, clear nutrition visibility, and supportive progress feedback.

Design principles:

- Fast daily logging first
- Clear calorie and macro progress
- Friendly coaching, not judgment
- Premium mobile UI
- Soft cards, rounded corners, good spacing
- No aggressive diet language
- AI features must always be reviewable before saving
- Manual entry must always remain available

## Main Screens

### 1. Today Dashboard

Purpose: show the user’s current day clearly and make logging food fast.

Hero card:

- Large calorie balance: `1,240 left`
- Ring progress around `760 / 2,000 kcal`
- Subtext: `On track for your goal`
- Primary action: `Log food`
- Secondary action: barcode/scan icon button

Macro row:

- Protein: `72g / 120g`
- Carbs: `118g / 220g`
- Fat: `41g / 70g`
- Each macro uses a small horizontal progress bar and accent color.

Meal timeline:

- Breakfast card: `Greek yogurt bowl`, `340 kcal`
- Lunch card: `Chicken wrap`, `420 kcal`
- Snack empty state: `Add snack`
- Dinner empty state: `Plan dinner`

Bottom navigation:

- Today
- Log
- Insights
- Profile

### 2. Quick Log

Purpose: make adding food feel faster than searching through a database forever.

Sections:

- Search field: `Search food or meal`
- Three mode chips: `Recent`, `Favorites`, `Scan`
- Recent items list with calorie and macro preview
- Meal target selector: Breakfast, Lunch, Dinner, Snack
- Sticky bottom action: `Add to Today`

Example recent items:

- `Banana`, `105 kcal`
- `2 eggs`, `156 kcal`
- `Chicken breast`, `220 kcal`
- `Oatmeal with milk`, `310 kcal`

### 3. Insights

Purpose: show trends without judgment.

Sections:

- Weekly average card: `1,930 kcal avg`
- Streak card: `5 days logged`
- Pattern insight: `You usually hit protein when breakfast includes 25g+`
- Macro distribution chart
- Gentle recommendation card: `Try adding a protein snack around 4 PM`

## Component Inventory

- App shell frame with status bar and bottom navigation
- Calorie balance card
- Macro progress pill/card
- Meal timeline row
- Food search field
- Recent food row
- Primary button
- Icon button
- Segmented chip group
- Insight card

## UX Notes

- Logging should be the dominant action from every screen.
- Avoid red for missed targets; reserve coral for protein accent, not error.
- Empty meal states should invite action, not imply failure.
- Use exact numbers for calories, but softer language for coaching.
- Keep dashboard information dense enough for repeat daily use.

## Figma Build Notes

Create local styles/variables first:

- Color variables for background, surface, text, border, primary, macro accents
- Text styles: `Title/Large`, `Title/Medium`, `Body`, `Body/Strong`, `Caption`
- Effect style: subtle card shadow, or use flat bordered cards if shadows feel too busy

Then build three mobile frames side by side:

- `01 Today Dashboard`
- `02 Quick Log`
- `03 Insights`

Create reusable local components for:

- `Button / Primary`
- `Button / Icon`
- `Macro Card`
- `Meal Row`
- `Food Row`
- `Bottom Nav Item`
