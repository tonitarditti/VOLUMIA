const https = require("https");

const req = https.get("https://mcp.figma.com/mcp/html-to-design/capture.js", (res) => {
  console.log("status", res.statusCode);
  let bytes = 0;
  res.on("data", (chunk) => {
    bytes += chunk.length;
  });
  res.on("end", () => {
    console.log("bytes", bytes);
  });
});

req.on("error", (err) => {
  console.log("error", err.message);
});

req.setTimeout(7000, () => {
  console.log("timeout");
  req.destroy();
});
