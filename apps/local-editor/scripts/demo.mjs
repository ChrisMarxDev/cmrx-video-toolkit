import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const index = process.argv.indexOf("--workspace");
const root = path.resolve(
  index < 0 ? "workspaces/demo" : process.argv[index + 1],
);
if (fs.existsSync(path.join(root, "project.json")))
  throw Error(
    `Project already exists in ${root}. Choose another --workspace; existing work is never reset.`,
  );
fs.mkdirSync(path.join(root, "media"), { recursive: true });
for (const [name, color, freq] of [
  ["take-a", "#45256b", 440],
  ["take-b", "#17615a", 660],
]) {
  console.log(`Generating ${name}…`);
  execFileSync(
    process.env.FFMPEG || "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc2=size=640x360:rate=24,drawbox=x=0:y=0:w=iw:h=50:color=${color}:t=fill`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${freq}:sample_rate=48000`,
      "-t",
      "8",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      path.join(root, "media", `${name}.mp4`),
    ],
    { stdio: "inherit" },
  );
}
const clip = {
  kind: "video",
  in: 0,
  track: 0,
  x: 0,
  y: 0,
  width: 640,
  height: 360,
  muted: false,
};
const project = {
  schemaVersion: 1,
  revision: 0,
  name: "The workspace test",
  width: 640,
  height: 360,
  fps: 24,
  notes: { agentOwned: "This unknown field must survive every UI edit." },
  assets: [
    {
      id: "take-a",
      name: "Take A · 440 Hz",
      path: "media/take-a.mp4",
      duration: 8,
      audio: true,
    },
    {
      id: "take-b",
      name: "Take B · 660 Hz",
      path: "media/take-b.mp4",
      duration: 8,
      audio: true,
    },
  ],
  clips: [
    {
      ...clip,
      id: "opening",
      name: "Opening · take A",
      assetId: "take-a",
      start: 0,
      duration: 4,
    },
    {
      ...clip,
      id: "second",
      name: "Second · take B",
      assetId: "take-b",
      start: 4,
      in: 1,
      duration: 4,
    },
    {
      ...clip,
      id: "inset",
      name: "Inset · take B",
      assetId: "take-b",
      start: 1,
      in: 2,
      duration: 2,
      track: 1,
      x: 410,
      y: 200,
      width: 200,
      height: 112,
      muted: true,
    },
    {
      id: "signal",
      name: "Coded signal",
      kind: "card",
      start: 1,
      in: 0,
      duration: 3,
      track: 2,
      x: 32,
      y: 60,
      width: 240,
      height: 70,
      muted: true,
      props: {
        strength: 0.65,
        color: "#d5ff45",
        customAgentData: "preserve-me",
      },
    },
  ],
};
fs.writeFileSync(
  path.join(root, "project.json"),
  JSON.stringify(project, null, 2) + "\n",
);
console.log(`Created ${root}. Start with npm start -- --workspace "${root}"`);
