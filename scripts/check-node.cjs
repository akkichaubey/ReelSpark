const [major, minor, patch] = process.versions.node.split('.').map(Number);
if (major !== 24 || minor < 22 || (minor === 22 && patch < 1)) {
  console.error(`Node ${process.versions.node} is unsupported. Use Node >=24.22.1 <25 via nvm; see NODE_RUNTIME.md.`);
  process.exit(1);
}
