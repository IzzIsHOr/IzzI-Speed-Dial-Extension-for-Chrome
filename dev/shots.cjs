// Captures Chrome Web Store screenshots. Run with: node dev/shots.cjs
//
// The store wants 1280x800 PNGs, so headless Chrome is pointed at the dev
// server at exactly that size. What it captures is the real interface, real
// CSS and real code; only the demo content and the "open this panel" nudge
// come from the shim, which never ships.
//
// Needs the dev server running: node dev/server.cjs

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:5177/";
const OUT = path.resolve(__dirname, "..", "dist", "shots");

const SCENES = [
  ["01-grid", "?seed=demo&nofx=1"],
  ["02-themes", "?seed=demo&nofx=1&scene=themes"],
  ["03-layout", "?seed=demo&nofx=1&scene=layout"],
  ["04-icons", "?seed=demo&nofx=1&scene=icons"],
  ["05-menu", "?seed=demo&nofx=1&scene=menu"]
];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

if (!fs.existsSync(CHROME)) throw new Error("Chrome not found at " + CHROME);

for (const [name, query] of SCENES) {
  const file = path.join(OUT, name + ".png");
  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--window-size=1280,800",
      // long enough for the seed, the boot read and the scene nudge to settle
      "--virtual-time-budget=6000",
      "--screenshot=" + file,
      BASE + query
    ],
    { stdio: ["ignore", "ignore", "ignore"] }
  );
  const kb = (fs.statSync(file).size / 1024).toFixed(0);
  console.log(`${name}.png  ${kb} KB`);
}

console.log("\n" + path.relative(path.resolve(__dirname, ".."), OUT));
