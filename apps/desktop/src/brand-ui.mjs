// Local sourced marks: resources/brands/catalog.json and LICENSE.
// New providers must register a real mark here alongside their adapter.
export const providerBrands = {
  chatgpt: { name: "ChatGPT", asset: "openai.png" },
  claude: { name: "Claude", asset: "claude-color.png" },
};
const brandMarks = {
  ChatGPT: "openai.png",
  Claude: "claude-color.png",
  OpenAI: "openai.png",
  Flutter: "flutter.png",
  Fluvie: "fluvie.png",
  FFmpeg: "ffmpeg.png",
  Gemini: "gemini-color.png",
  Mistral: "mistral-color.png",
  Higgsfield: "higgsfield.png",
};
export const logoAssets = [...new Set(Object.values(brandMarks))];
const mentionPattern =
  /\b(ChatGPT|Claude|OpenAI|Flutter|Fluvie|FFmpeg|Gemini|Mistral|Higgsfield)\b/g;
export function providerLogo(id, doc = document) {
  const brand = providerBrands[id];
  if (!brand) return null;
  return logo(brand.asset, doc);
}
function logo(asset, doc) {
  const img = doc.createElement("img");
  img.className = "provider-logo";
  img.src = "/brands/" + asset;
  img.alt = ""; // Always accompanies a visible name; don't repeat it to screen readers.
  img.width = img.height = 18;
  img.draggable = false;
  return img;
}
export function brandedText(text, doc = document) {
  const fragment = doc.createDocumentFragment();
  let from = 0;
  for (const match of text.matchAll(mentionPattern)) {
    fragment.append(doc.createTextNode(text.slice(from, match.index)));
    const label = doc.createElement("span");
    label.className = "brand-mention";
    label.append(logo(brandMarks[match[0]], doc), doc.createTextNode(match[0]));
    fragment.append(label);
    from = match.index + match[0].length;
  }
  fragment.append(doc.createTextNode(text.slice(from)));
  return fragment;
}
export function setBrandedText(element, text) {
  if (element.dataset.brandText === text && element.textContent === text) return;
  element.dataset.brandText = text;
  element.replaceChildren(brandedText(text, element.ownerDocument));
}
export function decorateBrandMentions(root) {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4); // Text nodes only; no model HTML.
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (
      [...node.nodeValue.matchAll(mentionPattern)].length &&
      !node.parentElement.closest("code, pre, .brand-mention, a")
    )
      nodes.push(node);
  }
  for (const node of nodes) node.replaceWith(brandedText(node.nodeValue, doc));
  return root;
}
