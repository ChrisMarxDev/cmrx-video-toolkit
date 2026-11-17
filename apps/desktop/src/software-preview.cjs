const fs = require("node:fs");
const path = require("node:path");

function softwarePreviewEnabled(profile, override) {
  const file = path.join(profile, "performance.json");
  let saved = {};
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (value && typeof value === "object" && !Array.isArray(value)) saved = value;
  } catch {}
  if (override === "1" || override === "0") {
    const softwarePreview = override === "1";
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      file + ".tmp",
      JSON.stringify({ ...saved, softwarePreview }),
      { mode: 0o600 },
    );
    fs.renameSync(file + ".tmp", file);
    return softwarePreview;
  }
  return saved.softwarePreview === true;
}
module.exports = { softwarePreviewEnabled };
