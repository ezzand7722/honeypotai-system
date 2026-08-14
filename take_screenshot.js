const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const PORT = 4174;
const DIST = "G:/college project/proj/frontend/dist";

const mime = { ".html":"text/html", ".js":"application/javascript", ".css":"text/css", ".svg":"image/svg+xml", ".png":"image/png", ".ico":"image/x-icon" };

const server = http.createServer((req, res) => {
  let file = req.url === "/" ? "/index.html" : req.url;
  let fpath = path.join(DIST, file);
  let ext = path.extname(fpath);
  try {
    let data = fs.readFileSync(fpath);
    res.writeHead(200, { "Content-Type": mime[ext] || "text/plain" });
    res.end(data);
  } catch(e) {
    res.writeHead(404);
    res.end("Not Found");
  }
});

server.listen(PORT, async () => {
  console.log("Server on port " + PORT);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto("http://localhost:" + PORT, { timeout: 30000, waitUntil: "networkidle" });
  await page.waitForTimeout(15000);
  await page.screenshot({ path: "G:/college project/proj/screenshot_dashboard.png", fullPage: false });
  console.log("SCREENSHOT SAVED");
  await browser.close();
  server.close();
  process.exit(0);
});
