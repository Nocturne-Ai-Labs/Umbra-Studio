import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { NUMERIC_UI_TEMPLATES } from '../frontend/src/i18n/numericUiTemplates';

const skippedTags = new Set(['code', 'kbd', 'pre', 'samp', 'script', 'style', 'svg', 'textarea']);
const uiAttributes = new Set(['alt', 'aria-label', 'placeholder', 'title', 'label', 'description', 'tooltip']);
function decodeJsxText(value: string) {
  return value.replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, entity) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[entity]);
}
export function isTechnicalUiLiteral(value: string): boolean {
  return !/[A-Za-z]{2}/.test(value)
    || /^(?:https?:|[A-Z]:[\\/]|\/|#|\.|__[^ ]+__)/.test(value)
    || /^[\w./-]+\.(?:png|jpg|jpeg|webp|gif|json|csv|safetensors|onnx|txt|ini|py|js|ts|gguf|pt|pth|bat|sh)$/i.test(value)
    || /^(?:[\w.-]+\/[\w./-]+|\d+(?:\.\d+)?\s*(?:[KMGT]i?B|px|fps)|[A-Z][\w-]*(?:\s*\|\s*[A-Z][\w-]*)+)$/i.test(value);
}
/** Display boundaries only: event arguments, input values and protected data are excluded. */
export function collectUiLocalizationPhrases(componentRoot: string) {
  const values = new Set<string>();
  const add = (value: string) => {
    const normalized = decodeJsxText(value).replace(/\s+/g, ' ').trim();
    if (normalized && normalized.length <= 2000 && !isTechnicalUiLiteral(normalized)) values.add(normalized);
  };
  const expressionText = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node)) add(node.text);
    else if (ts.isConditionalExpression(node)) {
      expressionText(node.whenTrue); expressionText(node.whenFalse);
    }
    else if (ts.isBinaryExpression(node)) {
      if ([ts.SyntaxKind.PlusToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) {
        expressionText(node.left); expressionText(node.right);
      } else if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) expressionText(node.right);
    }
    else if (ts.isObjectLiteralExpression(node)) return;
    else if (ts.isCallExpression(node)) {
      // Translation keys and function arguments are not rendered English. Still
      // visit components rendered by map callbacks within the expression.
      const jsxOnly = (child: ts.Node) => {
        if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) visit(child);
        else ts.forEachChild(child, jsxOnly);
      };
      ts.forEachChild(node, jsxOnly);
    }
    else if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return;
    // A nested component has its own boundaries; do not inspect its event arguments.
    else if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) visit(node);
    else if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) ts.forEachChild(node, expressionText);
  };
  const isProtected = (opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement) => {
    if (skippedTags.has(opening.tagName.getText())) return true;
    return opening.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && (
      attribute.name.getText() === 'data-i18n-skip'
      || attribute.name.getText() === 'translate' && attribute.initializer && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === 'no'
      || attribute.name.getText() === 'className' && attribute.initializer && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text.split(/\s+/).includes('notranslate')
      || attribute.name.getText() === 'contentEditable' && (!attribute.initializer
        || ts.isStringLiteral(attribute.initializer) && attribute.initializer.text !== 'false'
        || ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression?.kind !== ts.SyntaxKind.FalseKeyword)
    ));
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) && isProtected(node.openingElement) || ts.isJsxSelfClosingElement(node) && isProtected(node)) return;
    if (ts.isPropertyAssignment(node) && uiAttributes.has(node.name.getText().replace(/^['"]|['"]$/g, ''))) {
      // Option/menu descriptions often live in declared arrays instead of JSX.
      // Only inspect their display initializer, never value/id or call arguments.
      expressionText(node.initializer);
      return;
    }
    if (ts.isJsxText(node)) add(node.text);
    else if (ts.isJsxExpression(node) && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      if (node.expression) expressionText(node.expression);
      return;
    } else if (ts.isJsxAttribute(node)) {
      if (uiAttributes.has(node.name.getText()) && node.initializer) {
        if (ts.isStringLiteral(node.initializer)) add(node.initializer.text);
        else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) expressionText(node.initializer.expression);
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.name.endsWith('.tsx')) {
        const source = ts.createSourceFile(target, fs.readFileSync(target, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        visit(source);
        // Toast producers are known display boundaries even inside event handlers.
        // Arbitrary function arguments remain excluded.
        const feedback = (node: ts.Node) => {
          if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'showToast' && node.arguments[0]) expressionText(node.arguments[0]);
          ts.forEachChild(node, feedback);
        };
        feedback(source);
      }
    }
  };
  walk(componentRoot);
  for (const template of NUMERIC_UI_TEMPLATES) add(template);
  return values;
}
