import fs from "fs";
import path from "path";
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full);
    else if (ent.name.endsWith(".ts") || ent.name.endsWith(".tsx")) {
      let s = fs.readFileSync(full, "utf8");
      const next = s.replace(/from (["\\"])\\.\\.?\\/[^\"\\1]+\\.js\\1/g, (m, q) => m.replace(".js" + q, q));
      if (next !== s) fs.writeFileSync(full, next);
    }
  }
}
walk("apps/discord-mcp");
