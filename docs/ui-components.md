# ReelSpark shared UI

The dedicated [thumbnail cover section](thumbnail-cover.md) precedes timeline
content. Add track and export choices use shared Select; edit/replace/remove,
poster playback and separate downloads use shared Button. Specialized file
decoding/canvas generation remains local to cover handling.

Add track displays capitalized labels (Video, Intro, Overlay, Audio, Music,
Text, Captions); stored track-kind values remain lowercase for compatibility.

QA follow-up (2026-11-02): timeline inspector/settings forms use DialogSurface
with asChild to preserve markup while supplying focus trapping/restoration.
Closed Select triggers and dialog content allow Escape to reach Radix; other
editor shortcuts stay contained. Native Chromium media shadow controls can
consume Escape without a DOM event; Tab to Cancel in that case. See the
[QA/QC report](qa-qc-2026-11-01.md) for executed checks and limitations.

Timeline frame tiles use native lazy images for small authenticated cached JPEGs,
with bounded viewport mounting and load/error placeholders. A single portalled,
pointer-transparent, muted video supplies hover decoding. Retry uses shared
Button. These media controls remain custom; they do not replace clip selection,
trim, caption or audio interactions. Hover output keeps its media theme scope.

Clip motion uses shared Button/Input/Select controls. Numeric motion fields keep
draft input until blur/Enter and use native validity to block invalid values.
The custom Bezier graph has pointer and keyboard handles plus numeric control
points. Presets explicitly replace motion; clipboard operations deep-copy curves.
These specialized graph controls remain local to the clip inspector.

Caption timeline words use shared Button/Input controls. Word boundary handles
are keyboard-focusable sliders with source-time ARIA values. Inline editing
isolates text entry from editor shortcuts; word actions retain editor commands.
Viewport rendering limits caption DOM growth. Keep word editing inside existing
caption clips rather than reintroducing a separate caption row.

Audio automation uses shared `Button`/`Input` actions and fields. On-clip handles
remain native range inputs for keyboard, touch and pointer support within narrow
clips; they stop clip drag and double-click events. Pointer previews commit once
through the existing history path. Keep these specialized controls accessible
instead of replacing them solely to increase primitive coverage. Track solo
exposes its pressed state with `aria-pressed`.

Timeline Add Track uses the shared Radix-based shadcn `Select` composition in
`ui/select.tsx`. Its controlled empty value keeps the action placeholder visible
and allows repeatedly adding the same track type. The portal avoids clipping in
the timeline scroll area; its colors follow the existing dark/light zinc palette.
Trigger and popup keyboard events are isolated from editor playback shortcuts.

The local Button, Input, Textarea and Dialog primitives are adapted from the MIT-licensed
[shadcn/ui registry](https://github.com/shadcn-ui/ui). Behavior uses narrowly
scoped Radix packages; no stock shadcn stylesheet or framework upgrade is used.

`Button` defaults to `legacy`: native button semantics and caller classes are
preserved. `appearance` and `authGate` explicitly reuse existing ReelSpark
styles. The local `cn` concatenates classes without silently deleting conflicts.

Use explicit `default`, `secondary`, `outline`, `ghost`, `destructive` or `link`
variants and `default`, `sm`, `lg` or `icon` sizes for new actions. These provide
shared keyboard-focus, disabled and invalid styles. Size is explicit to avoid
changing existing toolbar geometry. Existing `legacy` callers can be converted
when their appearance and interaction have been reviewed; do not blindly replace
their state-dependent classes. New icon buttons still need an accessible name.

Application actions use the shared `Button`, including toolbar and player
actions. Text, number, password, search and multiline fields use shared `Input`
and `Textarea`. These keep native validation, form submission, controlled values,
React 19 refs and the caller's responsive classes. File, range, color and
checkbox controls retain their specialized native behavior. Do not add wrapper
elements around buttons or fields: editor geometry and pointer handling depend
on their DOM structure. Keep icon-only buttons named with `aria-label` or `title`.

New dialogs should compose `DialogSurface` with `DialogTitle` (use `asChild` to
retain an existing heading). Supply `DialogDescription`, or explicitly omit
`aria-describedby` when no description exists. Dialogs now used by subtitle
preview, smart editing and developer API configuration share the same focus and
Escape behavior as authentication, export, history and settings.
Social Copywriter and Thumbnail Creator also use this composition. Thumbnail
Creator uses one save-and-close callback for its close button and Escape so its
settings are retained on either dismissal path.

`DialogSurface` keeps callers' overlay/content classes. It adds Radix focus
management, accessible title/description composition, Escape, background
inertness and restoration to launchers that live outside a DialogTrigger.
Outside-click dismissal is opt-in because existing dialogs do not dismiss on
outside clicks. Blocking jobs must also block Escape/close, as ExportModal does.

Media gestures, range sliders, canvas, waveform/timestamp calculations and
rendering are specialized controls and remain custom. Do not replace these with
generic primitives simply to increase the component count.

`components.json` records existing aliases and the Tailwind v4 CSS location. It
was created manually. Review CLI-generated diffs before adding anything; do not
run init or accept a global CSS/style replacement. Future primitives must retain
the approved dark appearance and pass the audit's visual/interaction checks.

The optional light application theme is implemented in `src/app/theme.css`.
Color-critical output/player scopes use `data-theme-media="true"` to
retain the original palette. Do not add that attribute to whole application
pages, timeline editor chrome or dialog overlays. Timeline chrome uses
`data-editor-timeline="true"` and follows the application theme. The preference is device/browser-local and defaults
to dark; no account/project/render settings are modified by theme changes.
