try {
  const p = require("puppeteer");
  console.log("puppeteer-ok", typeof p.launch);
} catch (err) {
  console.log("puppeteer-missing", err && err.message ? err.message : String(err));
}
