# Parent video themes

`VideoStyle` is the caller-owned token set. `VideoThemeScope` passes it to a subtree;
`VideoStage` also installs its resolved style for all descendants. The existing
`VideoTheme.light/dark` enum still chooses the stage background; it is not a token
container and does not automatically invert every component surface.

```dart
final style = VideoStyle(
  background: const Color(0xFFFFFFFF), foreground: const Color(0xFF202020),
  surface: const Color(0xFFEAEAEA), accent: const Color(0xFFB8DFFF),
  darkBackground: const Color(0xFF141414), darkForeground: const Color(0xFFFFFFFF),
  body: const TextStyle(fontFamily: 'YourFont', fontSize: 24, height: 1.3),
  mono: const TextStyle(fontFamily: 'YourMono', fontSize: 20),
  caption: const TextStyle(fontFamily: 'YourFont', fontSize: 22, color: Color(0xFFFFFFFF)),
  borderWidth: 1.5, radius: 12, spacing: 24,
);
VideoStage(style: style, child: const Column(children: [
  VideoBlock(child: Text('A reusable idea')),
  VideoCaption('Caller-supplied caption'),
]));
```

Resolution order is explicit component `style:` → nearest `VideoThemeScope` →
a descriptive error. Public components never silently select a brand. Existing
explicit-style calls remain valid. Fonts must be supplied/preloaded by the host.
`body`, `mono` and `caption` accept full Flutter `TextStyle` values: family, weight,
size, line height, letter spacing and decoration. Palette roles include optional
`muted`, `rule` and `darkMuted`, otherwise derived from the supplied foregrounds.

Use `style.copyWith(...)` and a nested scope for local variations. Replacing the
parent style rebuilds dependent widgets, including const children and painters.
An explicit style intentionally isolates that widget from the parent's tokens.

```dart
VideoThemeScope(
  style: style.copyWith(radius: 0, borderWidth: 3),
  child: const VideoBlock(child: Text('Local variation')),
);
```

Blocks consume spacing, border width and radius. Caption/code/media panels consume
radius; code panels consume spacing. Technical process nodes consume radius and
stroke width; semantic shapes such as decisions remain diamonds. Other technical
widgets inherit typography and palette while retaining their domain-specific
geometry. Motion/GIF decoding utilities are style-free. Media contents keep their
own colors; a theme styles the frame rather than recoloring photographs.

A specialized library should wrap or extend these bases, supply its tokens once,
and preserve an existing parent scope. Keep names, logos, assets and brand recipes
in that library. Do not copy the geometry or decoding implementations.

The component browser's Original, Rounded and Editorial menu applies example token
sets to specimens. Those presets live in the demo app, not the public library.
New candidate designs are not registered until their real constructors, controls,
variants and tests exist. The current catalogue is an implementation inventory.
