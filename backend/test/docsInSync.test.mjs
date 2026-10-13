import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MENTOR_TOOLS_REGISTRY } from "../src/services/mentorTools.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readmePath = path.resolve(__dirname, "../../README.md");
if (!fs.existsSync(readmePath)) {
  console.error(`❌ README.md not found at ${readmePath}`);
  process.exit(1);
}

const readmeContent = fs.readFileSync(readmePath, "utf8");
const lines = readmeContent.split(/\r?\n/);

const tableStart = lines.findIndex((l) => l.startsWith("| Category | Tool Name | Parameters | Description |"));
if (tableStart === -1) {
  console.error("❌ Tool table header '| Category | Tool Name | Parameters | Description |' not found in README.md");
  process.exit(1);
}

const tableRows = [];
for (let i = tableStart + 2; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line.startsWith("|") || !line.endsWith("|")) break;
  tableRows.push(line);
}

if (tableRows.length !== MENTOR_TOOLS_REGISTRY.length) {
  console.error(`❌ Row count mismatch: README table has ${tableRows.length} tools, but MENTOR_TOOLS_REGISTRY has ${MENTOR_TOOLS_REGISTRY.length}.`);
  process.exit(1);
}

const docTools = {};
tableRows.forEach((row) => {
  const cells = row.split("|").map((s) => s.trim()).filter(Boolean);
  const toolName = cells[1].replace(/`/g, "");
  const paramsText = cells[2];
  const paramMatches = [...paramsText.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  docTools[toolName] = {
    rawParamsText: paramsText,
    paramNames: paramMatches,
  };
});

let errors = 0;
MENTOR_TOOLS_REGISTRY.forEach((regTool) => {
  const docTool = docTools[regTool.name];
  if (!docTool) {
    console.error(`❌ Missing tool in README: ${regTool.name}`);
    errors++;
    return;
  }

  const regProps = Object.keys(regTool.parameters.properties || {});
  const regReq = regTool.parameters.required || [];

  // Every registry property must be documented in README table
  regProps.forEach((prop) => {
    if (!docTool.paramNames.includes(prop)) {
      console.error(`❌ Missing parameter in README: Tool "${regTool.name}" is missing parameter "${prop}"`);
      errors++;
    }
  });

  // Every required property must be marked (required)
  regReq.forEach((req) => {
    if (!docTool.rawParamsText.includes(`\`${req}\` (required)`)) {
      console.error(`❌ Required parameter not marked in README: Tool "${regTool.name}" parameter "${req}" must be marked "(required)"`);
      errors++;
    }
  });

  // No phantom parameters in README
  docTool.paramNames.forEach((p) => {
    if (!regProps.includes(p)) {
      console.error(`❌ Extra undocumented parameter in README: Tool "${regTool.name}" has parameter "${p}" not in registry`);
      errors++;
    }
  });
});

Object.keys(docTools).forEach((docToolName) => {
  if (!MENTOR_TOOLS_REGISTRY.some((t) => t.name === docToolName)) {
    console.error(`❌ Extra tool in README not in registry: ${docToolName}`);
    errors++;
  }
});

if (errors > 0) {
  console.error(`❌ docsInSync check failed with ${errors} mismatch(es)!`);
  process.exit(1);
}

console.log("✅ docsInSync: All 14 Finn tools and parameters in README match MENTOR_TOOLS_REGISTRY exactly.");
