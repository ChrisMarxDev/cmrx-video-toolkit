// Browser-only entrypoint. Never reads OS files; changes use the host transaction API.
export function mount(root, { clip, update }) {
  const label = document.createElement("label");
  label.textContent = "Signal strength";
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "1";
  input.step = "0.05";
  input.value = String(clip.props?.strength ?? 0.65);
  input.setAttribute("aria-label", "Signal strength");
  input.onchange = () =>
    update({ props: { ...clip.props, strength: Number(input.value) } });
  label.append(input);
  root.replaceChildren(label);
  return () => root.replaceChildren();
}
