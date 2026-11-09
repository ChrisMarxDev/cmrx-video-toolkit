// Shared async initialization for exports and the editor's graphics cache.
// Preload local shader programs/fonts/images here before frame zero is captured.
// Import your graphics module and await its preload function when needed.
// Keep this idempotent: capture and composition builders may both call it.
Future<void> prepareGraphics() async {}
