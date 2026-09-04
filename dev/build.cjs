// Builds a distributable zip. Run with: node dev/build.cjs
//
// Only what the extension actually needs goes in: manifest, icons, src, plus
// the licence and readme for anyone who unzips it. The dev harness, git and
// editor files stay out, so nothing that fakes chrome.* ever ships.
//
// manifest.json sits at the root of the archive, which is what the Chrome Web
// Store requires and what "Load unpacked" expects after unzipping.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const INCLUDE = ["manifest.json", "LICENSE", "README.md", "icons", "src"];

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const stamp = `v${manifest.version}`;
const dist = path.join(ROOT, "dist");
const stage = path.join(dist, "izzi-speed-dial");
const zip = path.join(dist, `izzi-speed-dial-${stamp}.zip`);

// Only clear the staging folder and stale zips. dist/ also holds the store
// screenshots, and wiping the whole thing threw those away on every build.
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
for (const f of fs.existsSync(dist) ? fs.readdirSync(dist) : []) {
  if (f.endsWith(".zip")) fs.rmSync(path.join(dist, f));
}

let files = 0;
for (const entry of INCLUDE) {
  const from = path.join(ROOT, entry);
  if (!fs.existsSync(from)) throw new Error("missing: " + entry);
  const to = path.join(stage, entry);
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.cpSync(from, to, { recursive: true });
    const walk = (d) => {
      for (const name of fs.readdirSync(d)) {
        const p = path.join(d, name);
        fs.statSync(p).isDirectory() ? walk(p) : files++;
      }
    };
    walk(to);
  } else {
    fs.copyFileSync(from, to);
    files++;
  }
}

// PowerShell ships with Windows, so no zip dependency is needed
execFileSync(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${stage}\\*' -DestinationPath '${zip}' -Force`
  ],
  { stdio: "inherit" }
);

const size = fs.statSync(zip).size;
console.log(`\n${path.relative(ROOT, zip)}`);
console.log(`${files} files, ${(size / 1024).toFixed(1)} KB`);
