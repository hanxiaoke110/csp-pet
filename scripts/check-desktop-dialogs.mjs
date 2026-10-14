import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ts = createRequire(import.meta.url)('typescript');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const globals = new Set(['window', 'globalThis', 'self']);

export function findNativeConfirmReferences(text, fileName = 'source.tsx') {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const violations = [];
  const add = node => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    violations.push({ file: fileName, line: line + 1, column: character + 1 });
  };
  const visit = node => {
    if (ts.isPropertyAccessExpression(node) && globals.has(node.expression.getText(source)) && node.name.text === 'confirm') add(node);
    if (ts.isElementAccessExpression(node) && globals.has(node.expression.getText(source)) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === 'confirm') add(node);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'confirm') add(node);
    if (ts.isCallExpression(node) && node.arguments.some(argument => ts.isStringLiteral(argument) && argument.text === 'plugin:dialog|confirm')) add(node);
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === '@tauri-apps/plugin-dialog') {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const item of bindings.elements) if ((item.propertyName || item.name).text === 'confirm') add(item);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

export function checkDesktopDialogs(directory = root) {
  const violations = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
        violations.push(...findNativeConfirmReferences(fs.readFileSync(full, 'utf8'), path.relative(directory, full)));
      }
    }
  };
  for (const name of ['src', 'src-dungeon']) walk(path.join(directory, name));
  return violations;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = checkDesktopDialogs();
  if (violations.length) {
    for (const item of violations) console.error(`${item.file}:${item.line}:${item.column}: native confirm is forbidden; use an in-app confirmation modal.`);
    process.exitCode = 1;
  } else console.log('Desktop dialog gate passed: no native confirm references.');
}
