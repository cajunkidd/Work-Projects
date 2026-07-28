# UI Foundation Layer

Premium dark glass/glow design system for Contract Manager. Everything here is
renderer-only, dependency-free (CSS + React + recharts), theme-aware (all accents
derive from the runtime brand CSS vars) and respects `prefers-reduced-motion`.

```ts
import { StatTile, AnimatedNumber, useToast, Button } from '../components/ui'
```

All components are also default-exported from their own files. Hooks live in
`src/renderer/src/hooks/` and are re-exported from this barrel.

---

## Theming

`themeStore.applyThemeToDom()` sets these vars on `:root`:

- `--brand-primary/secondary/accent/light/dark` — hex colors
- `--brand-primary-rgb` (etc.) — space-separated channels for alpha: `rgb(var(--brand-primary-rgb) / 0.4)`

Tailwind brand colors are now **alpha-capable**: `bg-brand-primary/20`,
`text-brand-accent`, `border-brand-accent/30`. Surface elevation scale:
`bg-surface-0` (app canvas, near-black) … `bg-surface-4`. New shadows:
`shadow-glow`, `shadow-glow-lg`, `shadow-inset-hairline`, `shadow-elevated`.
Gradients: `bg-brand-gradient`, `bg-mesh`. Fonts: `font-sans` (Inter),
`font-display` (Space Grotesk — headings/KPIs), `font-mono` (JetBrains Mono).
Easings: `ease-spring`, `ease-out-expo`.

---

## Core primitives (back-compatible; only optional props were added)

### Button
```tsx
<Button variant="primary" size="md" loading={saving} icon={<PlusIcon />} onClick={...}>
  Save contract
</Button>
```
Props: `variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'glass'`,
`size?: 'sm' | 'md' | 'lg'`, `loading?: boolean` (spinner + disables),
`icon?: React.ReactNode`, plus all native `<button>` props.
Primary is a brand gradient with hover lift/glow, sheen sweep and click ripple.

### Card
```tsx
<Card spotlight gradientBorder onClick={() => navigate(id)} className="p-6">…</Card>
```
Props: `children`, `className?`, `onClick?: () => void`, `glow?: boolean`
(always-on brand glow), `spotlight?: boolean` (pointer-tracked highlight),
`gradientBorder?: boolean` (animated hairline), `padded?: boolean` (default true,
false removes the built-in `p-4`), `as?: 'div' | 'section'`.
Glass surface by default; clickable cards lift + glow on hover.

### Badge
```tsx
<Badge variant="success" dot>Active</Badge>
<Badge variant="danger" pulse>Overdue</Badge>
```
Props: `variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand'`,
`dot?: boolean`, `pulse?: boolean` (animated ping ring, implies dot), `className?`.

### Modal
```tsx
<Modal open={open} onClose={close} title="Edit contract" subtitle="INV-2041"
       width="max-w-2xl" footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button>Save</Button></>}>
  …body…
</Modal>
```
Props: `open`, `onClose`, `title`, `children`, `width?` (max-w-* class, default
`max-w-lg`), `subtitle?: string`, `footer?: React.ReactNode`.
Animated in/out (exit plays before unmount), backdrop blur, focus trap + focus
restore, Esc to close, body scroll lock. Rendered in a portal.

### Input
```tsx
<Input label="Vendor" placeholder="Acme Corp" icon={<SearchIcon />} hint="Legal entity name" error={errors.vendor} />
```
Props: `label?`, `error?` (shake replays on each new error), `icon?: React.ReactNode`,
`hint?: string`, plus all native `<input>` props. `className` still lands on the
`<input>` element itself.

### Select
```tsx
<Select label="Status" options={[{ value: 'active', label: 'Active' }]} value={v} onChange={...} />
```
Props: `label?`, `options: { value: string | number; label: string }[]`, `error?`,
`icon?`, `hint?`, plus native `<select>` props. Custom chevron, dark option list.

---

## New components

### StatTile — hero KPI tile (the dashboard workhorse)
```tsx
<StatTile
  label="Total contract value"
  value={4823000}
  format={(n) => `$${Math.round(n).toLocaleString()}`}
  delta={12.4}
  deltaLabel="vs last quarter"
  icon={<DollarIcon />}
  data={[42, 48, 45, 61, 58, 72, 80]}
  accent="var(--brand-accent)"     // any CSS color; defaults to brand primary
  onClick={() => navigate('/contracts')}
/>
```
Props: `label: string`, `value: number`, `format?`, `delta?: number` (%, sign
picks up/down arrow + color), `deltaLabel?: string`, `icon?`, `data?: number[]`
(sparkline), `accent?: string`, `className?`, `onClick?`.

### AnimatedNumber
```tsx
<AnimatedNumber value={total} format={(n) => `$${Math.round(n).toLocaleString()}`} duration={900} className="text-2xl" />
```
Props: `value: number`, `format?: (n: number) => string`, `duration?: number`,
`className?`. Counts up from the previously displayed value on every change.

### Sparkline
```tsx
<Sparkline data={[3, 5, 4, 8, 7, 10]} color="var(--brand-accent)" height={32} className="w-full" />
```
Props: `data: number[]`, `color?: string`, `height?: number` (default 32),
`className?`. Gradient area + animated draw-in; fills container width.

### ProgressRing
```tsx
<ProgressRing value={68} size={96} strokeWidth={8}>
  <span className="text-xs text-slate-300">68% used</span>
</ProgressRing>
```
Props: `value: number` (0–100), `size?`, `strokeWidth?`, `color?: string`
(single-color override; default = brand gradient), `glow?: boolean` (default true),
`children?` (center slot; defaults to rounded %), `className?`.

### ProgressBar
```tsx
<ProgressBar value={spent} max={budget} showLabel />
```
Props: `value`, `max?` (default 100), `height?` (px, default 8), `showLabel?`,
`thresholds?: { warn: number; danger: number }` (default `{75, 90}` — brand →
amber → red), `color?: string` (overrides thresholds), `className?`.
Animated fill + shimmer sweep.

### Skeleton / SkeletonText / SkeletonCard
```tsx
<Skeleton className="w-40 h-6" />
<SkeletonText lines={4} />
<SkeletonCard />
```

### Toast (provider + hook)
```tsx
// mount ONCE at app root:
<ToastProvider><App /></ToastProvider>

// anywhere below:
const { toast, success, error, info, warning, dismiss } = useToast()
success('Contract saved', 'INV-2041 updated')
toast({ title: 'Import running', type: 'info', duration: 0 })  // duration 0 = sticky
```
Types: `'success' | 'error' | 'info' | 'warning'`. Auto-dismiss (default 4500 ms)
with progress bar, slide-in from bottom-right, close button.

### CommandPalette
```tsx
// mount once (e.g. in Layout):
<CommandPalette commands={[
  { id: 'go-dash', label: 'Go to Dashboard', group: 'Navigate', hint: 'g d', icon: <HomeIcon />, run: () => navigate('/') },
  { id: 'new-contract', label: 'New contract', group: 'Actions', run: openCreate }
]} />

// open programmatically:
const palette = useCommandPalette()
palette.open() // .close() / .toggle()
```
Opens with ⌘K / Ctrl+K. Fuzzy filter, ↑↓/Enter/Esc keyboard nav, grouped sections.
Props: `commands: Command[]`, `placeholder?`. `Command = { id, label, hint?, group?, icon?, run }`.

### Tooltip
```tsx
<Tooltip content="Rename department" side="top" delay={300}><Button variant="ghost">✎</Button></Tooltip>
```
Props: `content: React.ReactNode`, `children`, `side?: 'top' | 'bottom' | 'left' | 'right'`,
`delay?: number`, `className?`. Portal-positioned, fade+scale, works on hover and focus.

### Tabs
```tsx
<Tabs
  tabs={[{ id: 'overview', label: 'Overview' }, { id: 'invoices', label: 'Invoices', icon: <DocIcon /> }]}
  active={tab}
  onChange={setTab}
  variant="underline"   // or "pills"
/>
```
Controlled. The indicator (gradient underline or glass pill) slides between tabs.

### PageTransition
```tsx
// wrap the routed content once, inside the Router:
<PageTransition><Outlet /></PageTransition>
```
Replays a fade/slide/blur-in whenever `useLocation().pathname` changes.

### EmptyState
```tsx
<EmptyState
  title="No contracts yet"
  description="Import a spreadsheet or create your first contract to get started."
  action={<Button onClick={openCreate}>New contract</Button>}
/>
```
Props: `title`, `description?`, `action?`, `icon?` (replaces the built-in
brand-tinted document illustration), `className?`.

### ConfirmDialog / useConfirm
```tsx
<ConfirmDialog open={open} title="Delete contract?" message="This cannot be undone."
               danger loading={deleting} onConfirm={doDelete} onCancel={() => setOpen(false)} />

// or promise-style:
const { confirm, dialog } = useConfirm()
const handleDelete = async () => {
  if (await confirm({ title: 'Delete contract?', danger: true, confirmLabel: 'Delete' })) doDelete()
}
return <>{page}{dialog}</>
```

---

## Hooks

| Hook | Signature | Purpose |
|---|---|---|
| `useCountUp` | `(target: number, duration = 900) => number` | rAF count-up with ease-out-expo |
| `useSpotlight` | `<T extends HTMLElement>() => { ref, onMouseMove }` | sets `--mx/--my` for `.spotlight` |
| `useHotkeys` | `(combo: string, handler, enabled = true) => void` | global shortcut, e.g. `'mod+k'`, `'ctrl+shift+p'`, `'escape'`; comma-separates alternatives |
| `useInView` | `(options?: IntersectionObserverInit & { once?: boolean }) => { ref, inView }` | reveal-on-scroll |

---

## CSS utility classes (index.css)

| Class | Effect |
|---|---|
| `.glass` / `.glass-strong` | frosted translucent surface with inner highlight (strong = modals/palette) |
| `.card-glow` | brand-tinted glow + border tint on hover |
| `.gradient-border` | animated brand gradient hairline border (needs `rounded-*`; uses `::before`) |
| `.shimmer` | skeleton sweep (also usable on any block) |
| `.aurora` | slow drifting brand radial blobs behind content (hero/login backdrops) |
| `.grid-bg` | subtle drifting grid backdrop with radial mask |
| `.text-gradient` | brand gradient text |
| `.noise` | SVG grain overlay (adds `::after`) |
| `.spotlight` | pointer radial highlight driven by `--mx/--my` (pair with `useSpotlight`) |
| `.stagger` | children fade-up in sequence; automatic to 12 children, or set `style={{ '--i': index }}` per child for longer lists |
| `.page-enter` | route entrance animation (used by PageTransition) |
| `.top-edge-glow` | gradient hairline across an element's top edge |
| `.theme-transition` | smooth background/color transitions on theme change (pre-existing) |

## Tailwind animation utilities

`animate-fade-in-up`, `animate-fade-in`, `animate-scale-in`,
`animate-slide-in-right`, `animate-shimmer`, `animate-pulse-glow`,
`animate-float`, `animate-spin-slow`, `animate-gradient-pan`
(needs an oversized `background-size`), `animate-count-pop`,
`animate-aurora-drift`, `animate-border-flow`, `animate-shake`.

All decorative animation is disabled under `prefers-reduced-motion: reduce`.

## Gotchas for page engineers

- `ToastProvider` must wrap the app once; `useToast()` throws outside it.
- `CommandPalette` should be mounted exactly once (Layout is the natural spot).
- `Modal`, `Tooltip`, `Toast`, `CommandPalette` render into portals — no
  z-index fights with page content (`z-50/90/100/110` respectively).
- `.gradient-border` and `.noise` use `::before`/`::after`; don't combine them
  with other pseudo-element utilities on the same node.
- Recharts is pre-themed globally (grid, axes, tooltip, cursor, active-dot glow)
  — use `var(--brand-primary)` / `var(--brand-accent)` for series strokes.
- Keep numbers/labels in white/slate text; let accents live in marks, icons and
  chips (see StatTile for the pattern).
