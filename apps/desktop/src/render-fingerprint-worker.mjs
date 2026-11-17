import { parentPort, workerData } from "node:worker_threads";
import { Playground } from "./playground.mjs";

// Inspect only. Do not construct a Playground: that would reconcile receipts,
// scaffold source files or acquire another editing/rendering authority.
const inspector = Object.assign(Object.create(Playground.prototype), {
  workspace: workerData.workspace,
});
const inspect = () => {
  try {
    parentPort.postMessage({
      fingerprint: inspector.fingerprint(),
      hasGraphics: inspector.hasGraphics(),
    });
  } catch (error) {
    parentPort.postMessage({ sourceError: error.message, hasGraphics: true });
  }
};
if (workerData.once) {
  inspect();
  parentPort.close();
} else parentPort.on("message", inspect);
