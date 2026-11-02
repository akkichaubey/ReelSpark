/* Static inventory only. This does not replace semantic review or browser QA. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(name);
    else if (/\.[cm]?[jt]sx?$/.test(name)) files.push(name);
  }
}
walk(path.join(root, 'src'));
const inventory = files.sort().map(file => {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const imports = [], controls = {}, unlabeledIconButtons = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      controls[tag] = (controls[tag] || 0) + 1;
      if (tag === 'button' || tag === 'Button') {
        const attributes = node.attributes.properties.map(property => property.name?.getText(source));
        const parent = node.parent;
        if (!attributes.includes('aria-label') && !attributes.includes('title') && ts.isJsxElement(parent) &&
          parent.children.every(child => !ts.isJsxText(child) || !child.text.trim()) &&
          !parent.children.some(child => ts.isJsxExpression(child))) {
          unlabeledIconButtons.push(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { file: path.relative(root, file).replaceAll('\\', '/'), lines: text.split('\n').length,
    imports, controls, possibleUnlabeledButtons: unlabeledIconButtons,
    client: /^\s*['"]use client['"]/m.test(text),
    handlers: [...new Set([...text.matchAll(/\b(on[A-Z][a-zA-Z]+)=/g)].map(match => match[1]))],
    apiMethods: [...text.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD)\b/g)].map(match => match[1]) };
});
const output = path.join(root, 'storage/ui-audit');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'source-inventory.json'), JSON.stringify({ note: 'Static AST inventory; possible label findings require manual verification.', inventory }, null, 2));
const ui = inventory.filter(item => item.file.endsWith('.tsx'));
fs.writeFileSync(path.join(output, 'component-inventory.md'), '# Static UI inventory\n\nGenerated from actual source ASTs. Counts are JSX declarations, not mounted instances. This is not a manual-review completion claim.\n\n| File | Lines | Native controls | Components |\n| --- | ---: | --- | --- |\n' + ui.map(item => `| ${item.file} | ${item.lines} | ${Object.entries(item.controls).filter(([key]) => /^(button|input|select|textarea|form|table|progress|dialog)$/.test(key)).map(([key, count]) => `${key}: ${count}`).join(', ')} | ${Object.keys(item.controls).filter(key => /^[A-Z]/.test(key)).join(', ')} |`).join('\n') + '\n');
console.log(`Inventoried ${inventory.length} source modules, ${ui.length} TSX surfaces, ${inventory.filter(item => item.apiMethods.length).length} API handlers. Artifacts: storage/ui-audit/`);
