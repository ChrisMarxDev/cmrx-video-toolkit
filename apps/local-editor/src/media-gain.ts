// HTMLMediaElement.volume stops at 1. Web Audio supplies the same linear gain
// used by FFmpeg/Fluvie, without replacing source media or changing timestamps.
let context: AudioContext | undefined;
const graphs = new WeakMap<
  HTMLMediaElement,
  {
    source: MediaElementAudioSourceNode;
    gain: GainNode;
    connected: boolean;
  }
>();
function resume() {
  if (context && context.state !== "running" && context.state !== "closed")
    void context.resume().catch(() => {});
}
window.addEventListener("pointerdown", resume, { capture: true });
window.addEventListener("keydown", resume, { capture: true });
export function setMediaGain(media: HTMLMediaElement, value: number) {
  let graph = graphs.get(media);
  if (!graph && value > 1) {
    context ||= new AudioContext();
    graph = {
      source: context.createMediaElementSource(media),
      gain: context.createGain(),
      connected: false,
    };
    graphs.set(media, graph);
  }
  if (graph) {
    if (!graph.connected) {
      graph.source.connect(graph.gain);
      graph.gain.connect(context!.destination);
      graph.connected = true;
    }
    media.volume = 1;
    graph.gain.gain.value = value;
    resume();
  } else media.volume = value;
  media.dataset.audioGain = String(value);
}
export function releaseMediaGain(media: HTMLMediaElement) {
  const graph = graphs.get(media);
  if (!graph) return;
  graph.source.disconnect();
  graph.gain.disconnect();
  graph.connected = false;
}
