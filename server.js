const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const url = require("url");

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const PUBLIC_DIR = path.join(__dirname, "public");
fs.mkdirSync(DATA_DIR, { recursive: true });

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Portfolio-Password",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS"
  });
  res.end(body);
}
function safeId(id) {
  return /^[a-z0-9_-]{3,40}$/.test(id);
}
function hash(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString("hex");
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", c => {
      b += c;
      if (b.length > 8 * 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      try { resolve(JSON.parse(b || "{}")); } catch(e) { reject(e); }
    });
    req.on("error", reject);
  });
}
function fileFor(id) { return path.join(DATA_DIR, id + ".json"); }

async function portfolioApi(req, res, id) {
  if (!safeId(id)) return json(res, 400, {error:"invalid portfolio id"});
  const file = fileFor(id);
  const password = req.headers["x-portfolio-password"] || "";

  if (req.method === "PUT") {
    if (password.length < 6) return json(res, 400, {error:"password must be at least 6 characters"});
    let body;
    try { body = await readBody(req); } catch(e) { return json(res, 400, {error:"invalid JSON"}); }
    if (!body.data || typeof body.data !== "object") return json(res, 400, {error:"data is required"});

    if (fs.existsSync(file)) {
      const old = JSON.parse(fs.readFileSync(file, "utf8"));
      if (old.passwordHash !== hash(password, old.salt))
        return json(res, 401, {error:"password mismatch"});
      old.data = body.data;
      old.updatedAt = new Date().toISOString();
      fs.writeFileSync(file, JSON.stringify(old, null, 2), "utf8");
    } else {
      const salt = crypto.randomBytes(16).toString("hex");
      const record = {
        version: 1,
        salt,
        passwordHash: hash(password, salt),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        data: body.data
      };
      fs.writeFileSync(file, JSON.stringify(record, null, 2), "utf8");
    }
    return json(res, 200, {ok:true, updatedAt:new Date().toISOString()});
  }

  if (req.method === "GET") {
    if (!fs.existsSync(file)) return json(res, 404, {error:"portfolio not found"});
    const record = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!password || hash(password, record.salt) !== record.passwordHash)
      return json(res, 401, {error:"password mismatch"});
    return json(res, 200, {ok:true, data:record.data, updatedAt:record.updatedAt});
  }
  return json(res, 405, {error:"method not allowed"});
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  const u = url.parse(req.url, true);

  if (u.pathname.startsWith("/api/portfolio/")) {
    const id = decodeURIComponent(u.pathname.slice("/api/portfolio/".length));
    try { return await portfolioApi(req, res, id); }
    catch(e) { console.error(e); return json(res, 500, {error:"server error"}); }
  }

  let pathname = u.pathname === "/" ? "/index.html" : u.pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!file.startsWith(PUBLIC_DIR)) return json(res, 403, {error:"forbidden"});
  fs.readFile(file, (err, content) => {
    if (err) return json(res, 404, {error:"not found"});
    const ext = path.extname(file);
    const type = ext === ".html" ? "text/html; charset=utf-8" :
                 ext === ".js" ? "text/javascript; charset=utf-8" :
                 ext === ".css" ? "text/css; charset=utf-8" : "application/octet-stream";
    res.writeHead(200, {"Content-Type":type, "Cache-Control":"no-store"});
    res.end(content);
  });
});
server.listen(PORT, () => console.log(`Portfolio app: http://localhost:${PORT}`));
