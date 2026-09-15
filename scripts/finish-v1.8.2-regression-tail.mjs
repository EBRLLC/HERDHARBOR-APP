import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const edit = (name, mutator) => {
  const target = path.join(root, name);
  const before = fs.readFileSync(target, "utf8");
  const after = mutator(before);
  if (after !== before) fs.writeFileSync(target, after);
  console.log(`${after !== before ? "updated" : "no-op"} ${name}`);
};
const all = (text, from, to) => text.split(from).join(to);

edit("tests/genetics-routing-completion-v1.6.1.test.cjs", (text) => text.replace(
  '  } else {\n    assert.match(buildId, /^october-subscription-launch-/);\n    assert.match(worker, /herdharbor-shell-v1\\.8\\.2/);\n  }',
  '  } else if (version === "1.8.1") {\n    assert.match(buildId, /^october-subscription-launch-/);\n    assert.match(worker, /herdharbor-shell-v1\\.8\\.1/);\n  } else {\n    assert.equal(buildId, "cloud-sync-v2-state-integrity-1");\n    assert.match(worker, /herdharbor-shell-v1\\.8\\.2-alpha-cloud-sync-v2-state-integrity-1/);\n  }'
));

edit("tests/monitoring-deployment-v1.5.1.test.cjs", (text) => {
  text = all(text, ".github/workflows/v1.8.1-ci.yml", ".github/workflows/v1.8.2-ci.yml");
  text = all(text, "v1.8.1 CI workflow must exist", "v1.8.2 CI workflow must exist");
  return text;
});

edit("tests/runtime-consolidation-v1.5.1.test.cjs", (text) =>
  all(text,
    'const APP_VERSION = window.HerdHarborBuild?.version || "1.8.1"',
    'const APP_VERSION = window.HerdHarborBuild?.version || "1.8.2"'
  )
);

console.log("final v1.8.2 regression tail closed");
