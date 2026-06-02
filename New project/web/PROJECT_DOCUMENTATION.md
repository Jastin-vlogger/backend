# ShipLogic Project Documentation

## 1. Project Overview
**Name**: `shiplogic-web`
**Type**: Angular Application
**Purpose**: Shipment management and tracking dashboard.

## 2. Technology Stack
- **Framework**: Angular v21
- **Styling**: 
  - **Sass (SCSS)**: For structured CSS with variables and mixins.
  - **Tailwind CSS v4**: For utility-first styling (configured via PostCSS).
  - **PrimeNG**: For UI components.
- **Build Tool**: Angular CLI (utilizing Vite/Esbuild)
- **Language**: TypeScript ~5.9

## 3. Project Structure
The project follows a standard scalable Angular architecture:

```
src/
├── app/
│   ├── core/           # Singleton services, guards, interceptors, models
│   │   ├── guards/
│   │   ├── interceptors/
│   │   ├── models/
│   │   └── services/
│   │
│   ├── shared/         # Reusable components, pipes, directives
│   │   ├── components/
│   │   ├── directives/
│   │   ├── pipes/
│   │   └── utils/
│   │
│   ├── features/       # Feature-specific modules
│   │   ├── dashboard/  # Dashboard views and stats
│   │   ├── shipment/   # Shipment management
│   │   ├── tracker/    # Shipment tracking
│   │   └── style-guide/# UI component showcase
│   │
│   ├── layouts/        # Layout wrappers
│   │   ├── auth-layout/
│   │   └── main-layout/
│   │
│   └── store/          # State management (NGRX or similar)
│
├── styles/             # Global styles
│   ├── styles.scss     # Main entry point
│   ├── _variables.scss # CSS/SCSS variables
│   ├── _mixins.scss    # Reusable mixins
│   ├── _tokens.scss    # Design tokens
│   └── _typography.scss# Font settings
```

## 4. Key Configurations

### Styles (`src/styles/styles.scss`)
The main stylesheet integrates Tailwind and local SCSS partials using modern Sass `@use` syntax:
```scss
@use 'variables';
@use 'mixins';
@use 'tokens';
@use 'typography';
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Dependencies
**Production**:
- `@angular/core`, `@angular/common`, `@angular/router`: Core Angular framework.
- `primeng`, `@primeng/themes`, `primeicons`: UI Component library.

**Development**:
- `tailwindcss`, `postcss`, `autoprefixer`: Styling utilities.
- `@angular/cli`, `@angular/build`: Build tools.

## 5. Recent Changes & Fixes
1.  **Fixed Syntax Error in Variables**:
    - Corrected invalid `\-color` declaration to `$primary-color` in `_variables.scss`.
2.  **Resolved Build Error**:
    - Created missing stylesheet: `src/app/features/dashboard/components/shipment-stats/shipment-stats.component.scss`.
3.  **Updated Sass Imports**:
    - Replaced deprecated `@import` with `@use` for local SCSS files.
    - Replaced `@import 'tailwindcss'` with `@tailwind` directives to fix deprecation warnings and ensure compatibility with modern tools.
