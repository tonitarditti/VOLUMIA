try {
  const pw = require("playwright");
  console.log("playwright-ok", Object.keys(pw).slice(0, 4).join(","));
} catch (err) {
  console.log("playwright-missing", err && err.message ? err.message : String(err));
}
