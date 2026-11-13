import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2),
  i = args.indexOf("--workspace");
let root = "workspaces/demo";
if (i >= 0) {
  root = args[i + 1];
  args.splice(i, 2);
}
const connection = JSON.parse(
  fs.readFileSync(path.join(root, ".editor/connection.json"), "utf8"),
);
const [command = "context", ...rest] = args;
const request = async (route, body) => {
  const r = await fetch(connection.url + "/api/" + route, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${connection.token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify({ actor: "cli", ...body }) } : {}),
  });
  const data = await r.json();
  if (!r.ok) throw Error(`${r.status}: ${data.error}`);
  return data;
};
let result;
if (command === "batch")
  result = await request(
    "operations",
    JSON.parse(fs.readFileSync(rest[0], "utf8")),
  );
else if (command === "context") result = await request("context");
else if (command === "comment") {
  const [revision, file] = rest;
  const { body, anchor } = JSON.parse(fs.readFileSync(file, "utf8"));
  result = await request("comment", {
    revision: Number(revision),
    body,
    anchor,
  });
} else if (command === "comment-status") {
  const [revision, id, status] = rest;
  result = await request("comment-update", {
    revision: Number(revision),
    id,
    patch: { status },
  });
} else if (command === "patch") {
  const [revision, id, json] = rest;
  result = await request("clip", {
    revision: Number(revision),
    id,
    patch: JSON.parse(json),
  });
} else if (["render", "undo", "redo"].includes(command))
  result = await request(command, { revision: Number(rest[0]) });
else if (command === "tool")
  result = await request("tool", { name: rest[0], revision: Number(rest[1]) });
else if (command === "cancel")
  result = await request("cancel", { id: rest[0] });
else if (command === "replace")
  result = await request("project", {
    revision: Number(rest[0]),
    project: JSON.parse(fs.readFileSync(rest[1], "utf8")),
  });
else
  throw Error(
    "Usage: batch FILE | context | patch REV CLIP JSON | comment REV FILE | comment-status REV ID open|resolved | render REV | undo REV | redo REV | tool NAME REV | cancel JOB | replace REV FILE [--workspace DIR]",
  );
console.log(JSON.stringify(result, null, 2));
