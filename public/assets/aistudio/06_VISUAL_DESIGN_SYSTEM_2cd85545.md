# 06 — Auteur Script Ecosystem: Visual Design System Specification

> **Bundle Role**: `File 6 of 7` — Authoritative UI/UX Visual Design System, Theme Engine, Component Tokens & Syntax Palette  
> **Target Consumer**: Stateless AI Agents building web applications, editors, visualizers, and diagnostic studios around **Auteur Script**  
> **Reference Lineage**: Synthesized from the latest **StageFlow** stationery/blueprint shell + **SceneFlow** semantic cue & script-paper palettes + **Auteur Script** editorial token styles  
> **Specification Lock**: Pure Auteur Script (`v0.4.0` Canonical Inline Syntax) — **100% Platform- & Model-Agnostic**

---

## Content Manifest (What Is Inside This File)

| Section | Title | Contents |
|---|---|---|
| **§1** | **Design Philosophy** | Physical Stationery Aesthetic, Quiet Functional Restraint, Instantaneous Zero-Stutter Responsiveness |
| **§2** | **Typographic Hierarchy (3-Font Triad)** | `Libre Baskerville` (serif), `Inter` (sans), `JetBrains Mono` (mono) roles & Tailwind classes |
| **§3** | **4-Mode App Shell Theme Engine & CSS Variables** | Ready-to-use CSS custom properties & Tailwind v4 `@theme` mapping for `Light`, `Warm`, `Dark`, and `Pure Black (OLED)` |
| **§4** | **Centralized `UI_TOKENS` Component Primitives** | Standardized Tailwind class bundles for headers, modals, dropdowns, tactile pills, segmented switches, and inputs |
| **§5** | **Auteur Script Semantic Syntax & Cue Color System** | Macro-Block phase colors, `v0.4.0` inline syntax tokens (`[TAG]`, `@ref`, `{dialogue}`, `<foley>`), plus the 8-category cue spectrum (Standard + Protanopia-safe) |
| **§6** | **Decoupled Content Canvas Palettes** | Independent theming for 3D Blueprint Viewports (`dioramaTheme`) and Script Paper Presets |
| **§7** | **Workspace Layout, Master-Detail Library & 60fps Invariants** | Resizable split-pane guards, zero-stutter theme swap, stacking context isolation, and Master-Detail Library UX |

---

## 1. Design Philosophy

All tools in the Auteur Script suite share a cohesive, recognizable aesthetic: **a tactile director's stationery desk paired with an architectural blueprint studio.**

1. **Physical Stationery Aesthetic**: Warm neutral stone and drafting-paper tones, pill-shaped tactile chrome, elevated cards with subtle borders (`border-border-main`), and crisp hairline dividers rather than flashy neon gradients or heavy glassmorphism.
2. **Quiet, Functional Restraint**: The UI chrome recedes so that the primary creative artifacts—the Auteur Script, synchronized video playback, timeline tracks, or 3D spatial staging—command 100% of visual attention.
3. **Instantaneous Responsiveness**: Theme swaps, panel resizes, and view switches execute with **zero CSS transition lag and zero frame drops**.
4. **Full Light / Warm / Dark / OLED Parity**: Every component, badge, border, and syntax highlight must be legible and balanced across all four shell modes.

---

## 2. Typographic Hierarchy (3-Font Triad)

Load three Google Fonts in `index.html` and map them in Tailwind `@theme`:

| Font Family | Classification | Role & Usage | Tailwind Class |
|---|---|---|---|
| **`Libre Baskerville`** | Editorial Serif | Brand identity headings, inspector titles, literary emphasis, directorial titles | `font-serif` |
| **`Inter`** | Geometric Sans-Serif | Primary UI chrome, button labels, navigation pills, descriptions, modal body text | `font-sans` |
| **`JetBrains Mono`** | Technical Monospace | Auteur Script editors/cards, `[TAG]` badges, timecodes, optical telemetry (degrees, meters, focal lengths), and compact micro-labels | `font-mono` |

```html
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
  rel="stylesheet"
/>
```

---

## 3. 4-Mode App Shell Theme Engine & CSS Variables

The 2D application shell supports **4 theme modes** (`light` | `warm` | `dark` | `auto` following OS `prefers-color-scheme`) plus an optional **Pure Black OLED** toggle (`[data-pure-black-shell="true"]` when dark is active).

### 3.1 Theme Atmosphere Matrix

| Theme Mode | Visual Atmosphere | `--app-bg` | `--surface` | `--border-main` | `--text-main` |
|---|---|---|---|---|---|
| **`Light`** *(Default)* | **Clean Warm Stone**: High-clarity editorial daylight | `#f5f5f4` | `#ffffff` | `#e7e5e4` | `#1c1917` |
| **`Warm`** | **Architectural Drafting Paper**: Ivory & cream stationery | `#f3efe6` | `#faf7f0` | `#dfd7c5` | `#2b231d` |
| **`Dark`** | **Warm Obsidian Studio**: Low eye-strain dark stone | `#0c0a09` | `#171514` | `#2c2825` | `#f5f5f4` |
| **`Pure Black`** | **OLED Blueprint Void**: Pitch black shell | `#000000` | `#000000` | `#242424` | `#f5f5f4` |

### 3.2 Canonical CSS Custom Properties & Tailwind v4 `@theme` (`src/index.css`)

```css
@import "tailwindcss";

:root,
[data-theme-category="light"] {
  --app-bg: #f5f5f4;
  --surface: #ffffff;
  --surface-subtle: #fafaf9;
  --surface-muted: #f5f5f4;
  --surface-hover: #e7e5e4;
  --surface-dark: #1c1917;
  --border-main: #e7e5e4;
  --border-subtle: #f5f5f4;
  --border-subtle-trans: rgba(231, 229, 228, 0.4);
  --text-main: #1c1917;
  --text-body: #292524;
  --text-muted: #78716c;
  --text-faint: #a8a29e;
  --text-placeholder: #d6d3d1;
  --btn-primary-bg: #1c1917;
  --btn-primary-text: #ffffff;
  --btn-primary-hover: #292524;
  --btn-secondary-bg: #f5f5f4;
  --btn-secondary-text: #57534e;
  --btn-secondary-hover: #e7e5e4;
  --overlay-bg: rgba(28, 25, 23, 0.4);
  --overlay-heavy: rgba(28, 25, 23, 0.6);
  --color-support: #FF5E5B;
  --color-support-hover: #e04e4b;
}

[data-theme-category="warm"] {
  --app-bg: #f3efe6;
  --surface: #faf7f0;
  --surface-subtle: #f6f2e8;
  --surface-muted: #ece5d6;
  --surface-hover: #e3dcce;
  --surface-dark: #2c251e;
  --border-main: #dfd7c5;
  --border-subtle: #ece5d6;
  --border-subtle-trans: rgba(223, 215, 197, 0.5);
  --text-main: #2b231d;
  --text-body: #3c322a;
  --text-muted: #7c6f62;
  --text-faint: #a69888;
  --text-placeholder: #c9bdae;
  --btn-primary-bg: #2b231d;
  --btn-primary-text: #faf7f0;
  --btn-primary-hover: #3d3229;
  --btn-secondary-bg: #ece5d6;
  --btn-secondary-text: #54473c;
  --btn-secondary-hover: #dfd7c5;
  --overlay-bg: rgba(43, 35, 29, 0.45);
  --overlay-heavy: rgba(43, 35, 29, 0.65);
  --color-support: #FF5E5B;
  --color-support-hover: #e04e4b;
}

[data-theme-category="dark"] {
  --app-bg: #0c0a09;
  --surface: #171514;
  --surface-subtle: #1c1917;
  --surface-muted: #24211e;
  --surface-hover: #2e2a27;
  --surface-dark: #0f0e0d;
  --border-main: #2c2825;
  --border-subtle: #201d1b;
  --border-subtle-trans: rgba(44, 40, 37, 0.5);
  --text-main: #f5f5f4;
  --text-body: #e7e5e4;
  --text-muted: #a8a29e;
  --text-faint: #78716c;
  --text-placeholder: #57534e;
  --btn-primary-bg: #f5f5f4;
  --btn-primary-text: #1c1917;
  --btn-primary-hover: #e7e5e4;
  --btn-secondary-bg: #24211e;
  --btn-secondary-text: #d6d3d1;
  --btn-secondary-hover: #2e2a27;
  --overlay-bg: rgba(0, 0, 0, 0.65);
  --overlay-heavy: rgba(0, 0, 0, 0.85);
  --color-support: #FF5E5B;
  --color-support-hover: #e04e4b;
}

[data-pure-black-shell="true"],
[data-pure-black-shell="true"] [data-theme-category="dark"] {
  --app-bg: #000000;
  --surface: #000000;
  --surface-subtle: #050505;
  --surface-muted: #111111;
  --surface-hover: #1a1a1a;
  --surface-dark: #000000;
  --border-main: #242424;
  --border-subtle: #141414;
  --border-subtle-trans: rgba(255, 255, 255, 0.08);
}

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-serif: "Libre Baskerville", serif;
  --font-mono: "JetBrains Mono", monospace;

  --color-app: var(--app-bg);
  --color-surface: var(--surface);
  --color-surface-subtle: var(--surface-subtle);
  --color-surface-muted: var(--surface-muted);
  --color-surface-hover: var(--surface-hover);
  --color-surface-dark: var(--surface-dark);
  --color-border-main: var(--border-main);
  --color-border-subtle: var(--border-subtle);
  --color-border-subtle-trans: var(--border-subtle-trans);
  --color-text-main: var(--text-main);
  --color-text-body: var(--text-body);
  --color-text-muted: var(--text-muted);
  --color-text-faint: var(--text-faint);
  --color-text-placeholder: var(--text-placeholder);
  --color-btn-primary-bg: var(--btn-primary-bg);
  --color-btn-primary-text: var(--btn-primary-text);
  --color-btn-primary-hover: var(--btn-primary-hover);
  --color-btn-secondary-bg: var(--btn-secondary-bg);
  --color-btn-secondary-text: var(--btn-secondary-text);
  --color-btn-secondary-hover: var(--btn-secondary-hover);
  --color-overlay-bg: var(--overlay-bg);
  --color-overlay-heavy: var(--overlay-heavy);
  --color-support: var(--color-support);
  --color-support-hover: var(--color-support-hover);

  --color-blueprint-accent: #38bdf8;
  --color-blueprint-stage-cam: #f59e0b;
}
```

---

## 4. Centralized `UI_TOKENS` Component Primitives (`src/ui/tokens/ui.ts`)

Centralize reusable Tailwind utility bundles in a single `UI_TOKENS` module rather than scattering ad-hoc classes across components. Never hardcode raw hex values in component JSX; always reference semantic utilities (`bg-surface`, `border-border-main`, `text-text-main`).

```ts
export const UI_TOKENS = {
  layout: {
    appHeader:
      'relative h-12 border-b border-border-main bg-surface flex items-center justify-between px-3 shrink-0 z-30 transition-all text-text-main select-none',
    leftPanelBase: 'flex flex-col bg-surface border-border-main z-10 text-text-main',
    rightPanelBase: 'bg-app flex flex-col overflow-hidden relative',
    sectionTitle: 'text-xs font-black uppercase tracking-[0.2em] text-text-faint',
    sectionTitleMini: 'text-[10px] font-black uppercase tracking-[0.2em] text-text-faint',
  },

  modal: {
    overlay:
      'fixed inset-0 z-[110] flex items-center justify-center p-4 bg-overlay-bg backdrop-blur-sm animate-in fade-in duration-300',
    overlayHeavy:
      'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-overlay-heavy backdrop-blur-sm animate-in fade-in duration-300',
    containerSm:
      'bg-surface w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-border-main text-text-main',
    containerMd:
      'bg-surface w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-border-main text-text-main',
    containerLg:
      'bg-surface w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-border-main text-text-main',
    containerLibrary:
      'relative w-full max-w-5xl h-[94vh] sm:h-[90vh] md:h-[86vh] bg-surface rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-border-main text-text-main',
    containerStaging:
      'relative w-full max-w-2xl max-h-[80vh] bg-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-main text-text-main',
    header:
      'flex items-center justify-between px-4 py-3.5 md:px-5 md:py-4 border-b border-border-subtle bg-surface-subtle shrink-0 text-text-main',
    footer:
      'px-6 py-3 border-t border-border-subtle bg-surface-subtle flex justify-end shrink-0',
    title: 'text-lg font-bold text-text-main',
    description: 'text-sm text-text-muted mt-2',
  },

  dropdown: {
    menu: 'absolute top-full left-0 mt-2 w-48 bg-surface rounded-xl shadow-xl border border-border-main overflow-hidden z-50 text-text-main divide-y divide-border-subtle',
    menuRight:
      'absolute top-full right-0 mt-2 w-48 bg-surface rounded-xl shadow-xl border border-border-main overflow-hidden z-50 text-text-main divide-y divide-border-subtle',
    menuWide:
      'absolute top-full right-0 mt-2 w-56 bg-surface rounded-xl shadow-xl border border-border-main overflow-hidden z-50 text-text-main divide-y divide-border-subtle',
    header: 'p-2 bg-surface-subtle border-b border-border-subtle flex items-center justify-between',
    headerText: 'text-[9px] font-black text-text-faint uppercase tracking-widest',
    item: 'w-full text-left px-3 py-2 text-xs font-semibold hover:bg-surface-subtle flex items-center justify-between transition-colors text-text-body hover:text-text-main cursor-pointer',
    itemActive:
      'w-full text-left px-3 py-2 text-xs font-semibold bg-surface-subtle text-text-main flex items-center justify-between transition-colors cursor-pointer',
  },

  button: {
    primary:
      'px-6 py-2.5 bg-btn-primary-bg text-btn-primary-text rounded-xl font-bold hover:bg-btn-primary-hover transition-all active:scale-95 shadow-md cursor-pointer',
    secondary:
      'px-5 py-2.5 bg-btn-secondary-bg text-btn-secondary-text rounded-xl font-bold hover:bg-btn-secondary-hover transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
    danger:
      'px-5 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all active:scale-95 shadow-md shadow-red-500/20 cursor-pointer',
    actionPill:
      'flex items-center gap-2 px-3 py-1.5 bg-surface hover:bg-surface-subtle text-text-body rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 border border-border-main shadow-xs cursor-pointer',
    actionPillActive:
      'flex items-center gap-2 px-3 py-1.5 bg-btn-primary-bg text-btn-primary-text rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 border border-btn-primary-bg shadow-xs cursor-pointer',
    filePill:
      'flex items-center gap-1.5 px-2.5 py-1.5 bg-surface hover:bg-surface-subtle text-text-body hover:text-text-main rounded-xl text-xs font-bold transition-all active:scale-95 border border-border-main shadow-2xs cursor-pointer',
    filePillActive:
      'flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-muted text-text-main rounded-xl text-xs font-bold transition-all active:scale-95 border border-border-main shadow-inner cursor-pointer',
    segmentedGroup:
      'flex items-center bg-surface-muted p-0.5 rounded-xl border border-border-main shadow-xs',
    segmentedItem:
      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] lg:text-xs font-semibold text-text-muted hover:text-text-main hover:bg-surface/60 transition-all active:scale-95 cursor-pointer',
    segmentedItemActive:
      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] lg:text-xs font-semibold bg-surface text-text-main shadow-xs transition-all cursor-pointer',
    iconClose:
      'p-2 hover:bg-surface-muted rounded-full transition-colors active:scale-90 text-text-faint hover:text-text-main cursor-pointer',
  },

  input: {
    search:
      'w-full pl-9 pr-8 py-2 bg-surface-muted hover:bg-surface-subtle focus:bg-surface text-xs text-text-body placeholder-text-placeholder rounded-xl border border-transparent focus:border-border-main shadow-inner focus:shadow-none transition-all outline-none',
    numberBox:
      'w-full bg-surface border border-border-main text-text-main rounded-xl px-2 py-1.5 text-[10px] font-mono focus:outline-none focus:ring-2 focus:ring-surface-dark/5',
    label: 'text-[10px] font-black uppercase tracking-[0.2em] text-text-faint ml-1',
    labelMini: 'text-[8px] font-black uppercase tracking-widest text-text-faint',
  },
} as const;
```

---

## 5. Auteur Script Semantic Syntax & Cue Color System

### 5.1 Macro-Block Phase Badges
When rendering Macro-Block headers or staging pills, map each block to its canonical semantic color:

| Macro-Block | Semantic Label | Color Family | Light Pill (`bg` / `text` / `border`) |
|---|---|---|---|
| **`[INTENT]`** | Directorial Intent | **Amber** | `#fffbeb` / `#d97706` / `#fde68a` |
| **`[LOGIC]`** | Coordinate Fence | **Sky Blue** | `#f0f9ff` / `#0284c7` / `#bae6fd` |
| **`[AESTHETIC]`** | World Aesthetic | **Emerald** | `#ecfdf5` / `#059669` / `#a7f3d0` |
| **`[OPENING]`** | First-Frame Anchor | **Teal** | `#f0fdf4` / `#0f766e` / `#ccfbf1` |
| **`[EXECUTION]`** | Active Timeline | **Rose** | `#fff1f2` / `#e11d48` / `#fecdd3` |
| **`[CONTINUITY PROTOCOL]`** | Continuity Inheritance | **Purple** | `#faf5ff` / `#7e22ce` / `#e9d5ff` |
| **Custom Staging (`[CHARACTERS]`, etc.)** | Staging Block | **Slate** | `#f1f5f9` / `#475569` / `#cbd5e1` |

### 5.2 Inline Sub-State Syntax Highlighting (`v0.4.0` Canonical Tokens)
Use `JetBrains Mono` with crisp pill-chip highlights for inline tokens inside `[EXECUTION]` and Staging blocks:

| Syntax Element | Example | Light Mode (`text` / `bg` / `border`) | Dark Mode (`text` / `bg` / `border`) |
|---|---|---|---|
| **Sub-State Tag** | `[CAM 01]`, `[ACT]`, `[BLOCK]` | `#0284c7` / `#e0f2fe` / `#bae6fd` | `#38bdf8` / `rgba(14,165,233,0.16)` / `rgba(56,189,248,0.35)` |
| **Multimodal Ref** | `@image1`, `@voice_oscar` | `#059669` / `#ecfdf5` / `#a7f3d0` | `#34d399` / `rgba(16,185,129,0.16)` / `rgba(52,211,153,0.35)` |
| **Spoken Dialogue** | `{Look at the dates, Ray.}` | `#b45309` / `#fffbeb` / `#fde68a` | `#fbbf24` / `rgba(245,158,11,0.15)` / `rgba(251,191,36,0.30)` |
| **Diegetic Foley** | `<steel table groaning>` | `#c2410c` / `#fff7ed` / `#ffedd5` *(italic)* | `#fb923c` / `rgba(249,115,22,0.15)` / `rgba(251,146,60,0.30)` *(italic)* |
| **Speaker Name** | `Miller`, `Ray` | `#0f172a` *(bold 700)* | `#f1f5f9` *(bold 700)* |
| **Verb & Delivery** | `says (unhurried)` | `#64748b` *(italic)* | `#94a3b8` *(italic)* |
| **Chaining Arrow** | `->` / `↳` | `#7c3aed` *(bold 700, 85% opacity)* | `#a78bfa` *(bold 700)* |
| **Aesthetic Key** | `Medium:`, `Wardrobe:` | `#0f172a` *(bold 700)* | `#e2e8f0` *(bold 700)* |

**Waterfall Execution Layout**: Each Macro-State line renders as a card separated by a dashed hairline (`1px dashed`), with Step 1 (`[CAM 01] ...`) as the bold lead line and Steps $2 \dots k$ indented beneath a vertical rail (`border-left: 2px solid`, hovering to `#8b5cf6`) prefixed by `↳` or `->`.

### 5.3 8-Category Timeline & Highlight Cue Spectrum (Standard + Protanopia-Safe)
For multi-track timelines, active cue overlays, or script category filters, use the 8-category RGB spectrum tuned per theme (`lightRgb`, `warmRgb`, `darkRgb`), including an accessible **Protanopia / Deuteranopia** profile:

| Category | Standard (`lightRgb` / `warmRgb` / `darkRgb`) | Protanopia-Safe Override |
|---|---|---|
| **Dialogue** | `250, 204, 21` / `222, 160, 24` / `253, 224, 71` *(Yellow)* | Same |
| **Action** | `59, 130, 246` / `75, 125, 185` / `96, 165, 250` *(Blue)* | `37, 99, 235` / `55, 110, 185` / `96, 165, 250` *(Firm Cobalt)* |
| **Camera** | `34, 197, 94` / `100, 155, 95` / `52, 211, 153` *(Green)* | `16, 185, 129` / `90, 150, 95` / `52, 211, 153` *(Emerald)* |
| **Shot** | `129, 140, 248` / `125, 118, 185` / `165, 180, 252` *(Indigo)* | `136, 19, 55` / `120, 25, 45` / `225, 29, 72` *(Deep Wine / Burgundy)* |
| **Audio** | `251, 146, 60` / `216, 108, 54` / `249, 115, 22` *(Orange)* | `249, 115, 22` / `216, 108, 54` / `251, 146, 60` *(Amber-Orange)* |
| **VFX** | `6, 182, 212` / `40, 155, 170` / `34, 211, 238` *(Cyan)* | `6, 182, 212` / `35, 160, 175` / `103, 232, 249` *(Ice Aqua)* |
| **Transition** | `244, 63, 94` / `215, 75, 95` / `251, 113, 133` *(Rose)* | `234, 88, 12` / `205, 75, 40` / `251, 113, 133` *(Vermilion Coral)* |
| **Environment** | `148, 163, 184` / `158, 146, 130` / `148, 163, 184` *(Slate)* | Same |

---

## 6. Decoupled Content Canvas Palettes

Tools should **decouple** the primary canvas theme (a 3D diorama viewport or a reading/editing script paper) from the outer 2D App Shell theme (`match-app` | `light` | `warm` | `dark`). Directors often read/edit in `Light` or `Warm` stationery chrome while keeping a 3D spatial stage in `Dark` obsidian void for high-contrast frustums and blocking lines.

### 6.1 3D Blueprint Stage Palette (`dioramaTheme.ts`)

| Palette Element | Dark Mode | Warm Mode | Light Mode |
|---|---|---|---|
| **Clear Color & Depth Fog (`bg`, `fog`)** | `#0c0a09` | `#f3efe6` | `#f5f5f4` |
| **Ground Plane Floor (`floorColor`)** | `#171514` | `#faf7f0` | `#ffffff` |
| **Primary Section Grid (`gridSection`, 1m)** | `#2c2825` | `#cfc4af` | `#d6d3d1` |
| **Minor Sub-Grid (`gridCell`, 0.25m)** | `#1c1917` | `#e4dccb` | `#e7e5e4` |
| **Stage Perimeter Frame (`borderLine`)** | `#38bdf8` *(Cyan)* | `#9e8c75` *(Muted Warm)* | `#78716c` *(Muted Stone)* |
| **Axis Crosshair & Reticle (`axisLine`)** | `#38bdf8` *(Cyan)* | `#b5a48d` *(Muted Warm)* | `#a8a29e` *(Stone Grey)* |
| **Stage Camera Accent** | `#f59e0b` *(Amber)* | `#f59e0b` *(Amber)* | `#f59e0b` *(Amber)* |

### 6.2 Script Paper Presets (Reading & Screen-Recording Surfaces)
- **Studio Crisp (`light`)**: `#ffffff` paper, `stone-900` ink, `stone-200` hairline ring.
- **Warm Parchment (`warm`)**: `#faf6ee` sepia paper, `#2e261f` ink, `amber-200/60` ring.
- **Midnight Slate (`dark`)**: `#18181b` dark slate paper, `stone-100` ink, `stone-800` ring.
- **OLED Blackout (`dark`)**: `#000000` pure black paper, `neutral-100` ink, `neutral-800` ring.
- **Navy Slate (`dark`)**: `#0f172a` deep navy paper, `slate-100` ink, `slate-800` ring.

---

## 7. Workspace Layout, Master-Detail Library & 60fps Interaction Invariants

### 7.1 Workspace Shell & Split-Pane Rules
- **3-Wing Compact Header (`h-12`, `z-30`)**: Left (Brand / File & Library pills), Center (Segmented Mode / Layout switchers), Right (Theme / Settings / Inspector toggles).
- **Resizable Split Workspace**: Clamp split divider between `18%` and `82%` with 1-click `Split` / `Full` modes.
- **Zero-Stutter Divider Drag (`body.is-resizing-split`)**: While dragging a split divider, attach `is-resizing-split` to `document.body` to disable CSS transitions and set `pointer-events: none` on embedded `<iframe />` players so pointer capture is never lost.
- **Zero-Stutter Theme Swap (`disableTransitionsTemporarily()`)**: Inject `.disable-theme-transitions * { transition: none !important; }` for 1 animation frame during theme switches to avoid multi-frame reflow stutter.
- **Stacking Context Isolation**: Wrap WebGL/3D viewports in `isolation: isolate` and constrain 3D HTML billboard labels strictly below 2D HUD overlays (`zIndexRange={[8, 0]}` vs. HUD `z-10`, capsules `z-20`, header `z-30`, modals `z-[100]+`).

### 7.2 Master-Detail Project / Script Library Pattern
For browsing catalogs of 10–50+ scripts or scenes, use an elevated 2-column Master-Detail modal (`max-w-5xl`, `h-[86vh]`):
- **Left Column (~40% — High-Density Navigation List)**:
  - Segmented category filter tabs (`All`, `Studies`, `Blueprints`, `Custom`).
  - Ultra-compact 2-line rows (`~50px` height): Line 1 = category badge (`Violet` for Studies, `Sky Blue` for Blueprints, `Amber` for Custom) + `Inter` bold title; Line 2 = `JetBrains Mono` `10px` delimited telemetry (duration, shot/beat count, aspect ratio).
  - Collapsible category accordions with rotating chevrons and count badges.
  - Full keyboard traversal (`ArrowUp`, `ArrowDown`, `Enter` to load).
- **Right Column (~60% — Inspector Pane)**:
  - `Libre Baskerville` serif title + directorial summary.
  - Instant procedural 2D SVG minimap or structural Staging summary (`[INTENT]`, `[LOGIC]`, cast/camera count).
  - Inline lifecycle actions (Rename, Duplicate, Export, Delete) without nested secondary modals.
