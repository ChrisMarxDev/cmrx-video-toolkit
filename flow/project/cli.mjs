#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { resolveProject, exportOTIO, inspectOTIO } from "./index.mjs";
import { Checkpoints } from "./checkpoints.mjs";
const flag = (name) => {
  const i = process.argv.indexOf("--" + name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const root = path.resolve(flag("workspace") ?? "."),
  action = flag("action") ?? "inspect",
  project = JSON.parse(
    fs.readFileSync(path.join(root, "project.json"), "utf8"),
  );
try {
  let result;
  if (action === "inspect") result = resolveProject(project);
  else if (action === "checkpoints") result = new Checkpoints(root).list();
  else if (action === "checkpoint-diff")
    result = new Checkpoints(root).diff(flag("id"), project);
  else if (action === "interchange-inspect")
    result = inspectOTIO(JSON.parse(fs.readFileSync(flag("input"), "utf8")));
  else {
    // Online changes always go through the app's one acceptance authority.
    const c = JSON.parse(
      fs.readFileSync(path.join(root, ".editor/chat-connection.json"), "utf8"),
    );
    const response = await fetch(c.url + "/chat/project-action", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + c.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        revision: project.revision,
        id: flag("id"),
        label: flag("label"),
        path: flag("path"),
      }),
    });
    result = await response.json();
    if (!response.ok) throw Error(result.error);
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} catch (e) {
  process.stderr.write(e.message + "\n");
  process.exitCode = 1;
}
