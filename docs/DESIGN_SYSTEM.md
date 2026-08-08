# UME Design System — Phase 1 (Foundation)

Centralized, dependency-free (Tailwind v4 + inline SVG). Used first by the App Shell; pages migrate in later phases.

## Tokens (`app/globals.css` `@theme`)
- **Brand navy** (sidebar/headers): `navy-950 → navy-600`.
- **Primary blue**: `brand-50 → brand-900` (actions, active nav).
- **Surfaces**: `canvas` (#f4f6fb app background), `surface` (#fff cards).
- **Semantic** (Tailwind defaults): `emerald` = positive/paid, `amber` = warning/due-soon, `red` = critical/overdue, `sky/brand` = info.
- **Font**: Cairo (Arabic + Latin) via `next/font`; `--font-cairo`. Mono: Geist Mono.
- Global: refined scrollbars, visible `:focus-visible` ring, `tabular-nums`, fade/slide keyframes.

## i18n (`lib/i18n.tsx`)
- `I18nProvider` + `useI18n()` → `{ locale, dir, t(key), setLocale, toggle }`.
- Default `ar` (RTL); `en` flips `dir=ltr`. Persisted in `localStorage.locale`; sets `<html lang/dir>`.
- Central `DICT` covers shell/nav/topbar/common. Content pages migrate later.

## App Shell (`app/dashboard/layout.tsx`)
- **Grouped sidebar** from `lib/screens.ts` `GROUPS` (Overview / Procurement / Fleet / Revenue / Finance / Operations / Admin), filtered by `canAccess` (permissions preserved).
- **Collapsible** (desktop, persisted `sidebarCollapsed`) → icon-only; **mobile drawer** (slides from RTL start).
- **Topbar**: page title, global search (disabled placeholder — backend later), notifications (placeholder), language switch, user avatar + logout.
- Wraps children in `I18nProvider` + `ToastProvider`.

## Primitives (`components/ui/`)
- `Icon` — line SVG set (`home, ship, receipt, chart, …`), `currentColor`.
- `Button` (primary/secondary/outline/ghost/danger/success · sm/md/lg · loading/icon), `Card` + `CardHeader`, `Badge` (6 tones), `Field`/`Input`/`Select`, `Spinner`, `Skeleton`, `EmptyState`, `Modal`, `Drawer`, `Toast` (`ToastProvider` + `useToast`).

## Rules
- Use tokens/primitives — no ad-hoc hex or bespoke buttons in new work.
- Never rely on color alone for status (pair with text/icon).
- RTL-first; verify both `dir`s. Keyboard focus must stay visible.
- No business-logic / API / DB changes in Phase 1.
