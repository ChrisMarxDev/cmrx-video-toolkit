import fs from "node:fs";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { captureFiles, describeInputs } from "../../local-editor/dist/render-contract.mjs";

const { workspace, dest, files, capturedFiles, authoredProject, engine } = workerData;
try {
  captureFiles(workspace, dest, files);
  const capturedProject = JSON.parse(fs.readFileSync(path.join(dest, "project.json"), "utf8"));
  if (JSON.stringify(capturedProject) !== JSON.stringify(authoredProject))
    throw Error("Project changed during snapshot; retry");
  const manifest = describeInputs(dest, capturedProject, capturedFiles, engine);
  parentPort.postMessage({ manifest });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
parentPort.close();
