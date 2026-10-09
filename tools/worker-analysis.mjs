// Static analysis shared by the module tooling and validators: parsing with the vendored acorn,
// top-level declarations, and lexically scoped references.
//
// freeReferences(node) walks a Program, a function or an expression and returns every identifier
// reference that is not declared inside it, honouring var and function hoisting, block scoping
// (the Worker is an ES module, so it is strict and block-level functions are block scoped),
// parameters with defaults and destructuring, catch parameters, class names and named function
// expressions. With { deferFunctions: true } bodies that do not run immediately (functions that
// are not invoked on the spot, methods, instance fields) are skipped, which is what evaluating a
// top-level initializer reads.
import * as acorn from "./vendor/acorn.mjs";

export const ACORN_VERSION = acorn.version;

export function parseModule(text) {
  return acorn.parse(text, { ecmaVersion: "latest", sourceType: "module" });
}

const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

export function bindingIdentifiers(pattern, out = []) {
  if (!pattern) return out;
  if (pattern.type === "Identifier") out.push(pattern);
  else if (pattern.type === "ObjectPattern") for (const property of pattern.properties) bindingIdentifiers(property.type === "RestElement" ? property.argument : property.value, out);
  else if (pattern.type === "ArrayPattern") for (const element of pattern.elements) bindingIdentifiers(element, out);
  else if (pattern.type === "AssignmentPattern") bindingIdentifiers(pattern.left, out);
  else if (pattern.type === "RestElement") bindingIdentifiers(pattern.argument, out);
  return out;
}

export function topLevelDeclarations(program) {
  return program.body.map((statement, index) => {
    let node = statement;
    let exported = false;
    if (statement.type === "ExportNamedDeclaration" && statement.declaration) { node = statement.declaration; exported = true; }
    if (statement.type === "ExportDefaultDeclaration") node = statement.declaration;
    let kind = "statement";
    let names = [];
    if (node.type === "FunctionDeclaration") { kind = "function"; names = node.id ? [node.id.name] : []; }
    else if (node.type === "ClassDeclaration") { kind = "class"; names = node.id ? [node.id.name] : []; }
    else if (node.type === "VariableDeclaration") { kind = node.kind; names = node.declarations.flatMap((d) => bindingIdentifiers(d.id).map((id) => id.name)); }
    else if (node.type === "ImportDeclaration") { kind = "import"; names = node.specifiers.map((s) => s.local.name); }
    else if (statement.type === "ExportNamedDeclaration") kind = "export-list";
    else if (statement.type === "ExportDefaultDeclaration") kind = "export-default";
    return { index, kind, names, statement, node, exported, start: statement.start, end: statement.end };
  });
}

class Scope {
  constructor(parent) { this.parent = parent; this.names = new Set(); }
  declare(name) { this.names.add(name); }
  has(name) { for (let scope = this; scope; scope = scope.parent) if (scope.names.has(name)) return true; return false; }
}

// var declarations anywhere in these statements, without entering nested functions.
function hoistVar(statements, scope) {
  const visitNode = (node) => {
    if (!node || typeof node.type !== "string" || FUNCTION_TYPES.has(node.type) || node.type === "ClassDeclaration" || node.type === "ClassExpression") return;
    if (node.type === "VariableDeclaration" && node.kind === "var") for (const d of node.declarations) for (const id of bindingIdentifiers(d.id)) scope.declare(id.name);
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visitNode);
      else if (child && typeof child.type === "string") visitNode(child);
    }
  };
  statements.forEach(visitNode);
}

// let/const/class/function declared directly in these statements.
function hoistLexical(statements, scope) {
  for (const statement of statements) {
    let node = statement;
    if ((statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration") && statement.declaration) node = statement.declaration;
    if (node.type === "VariableDeclaration" && node.kind !== "var") for (const d of node.declarations) for (const id of bindingIdentifiers(d.id)) scope.declare(id.name);
    else if ((node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && node.id) scope.declare(node.id.name);
    else if (node.type === "ImportDeclaration") for (const s of node.specifiers) scope.declare(s.local.name);
  }
}

function isReferencePosition(parent, key) {
  if (!parent) return true;
  switch (parent.type) {
    case "MemberExpression": return key !== "property" || parent.computed;
    case "Property": return key !== "key" || parent.computed;
    case "MethodDefinition":
    case "PropertyDefinition": return key !== "key" || parent.computed;
    case "LabeledStatement":
    case "BreakStatement":
    case "ContinueStatement": return key !== "label";
    case "MetaProperty":
    case "ImportSpecifier":
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier": return false;
    case "ExportSpecifier": return key === "local";
    default: return true;
  }
}

function record(ctx, node, parent, key, write) {
  const call = (parent?.type === "CallExpression" || parent?.type === "NewExpression") && key === "callee" || parent?.type === "TaggedTemplateExpression" && key === "tag";
  ctx.found.push({ name: node.name, start: node.start, end: node.end, write, call: Boolean(call) });
}

// Expressions inside a binding pattern (defaults, computed keys); the bound names themselves are skipped.
function visitBindingPattern(pattern, scope, ctx) {
  if (!pattern) return;
  if (pattern.type === "ObjectPattern") {
    for (const property of pattern.properties) {
      if (property.type === "RestElement") visitBindingPattern(property.argument, scope, ctx);
      else { if (property.computed) visit(property.key, scope, ctx, property, "key"); visitBindingPattern(property.value, scope, ctx); }
    }
  } else if (pattern.type === "ArrayPattern") pattern.elements.forEach((element) => visitBindingPattern(element, scope, ctx));
  else if (pattern.type === "AssignmentPattern") { visitBindingPattern(pattern.left, scope, ctx); visit(pattern.right, scope, ctx, pattern, "right"); }
  else if (pattern.type === "RestElement") visitBindingPattern(pattern.argument, scope, ctx);
}

// Assignment targets: identifiers are references that are written.
function visitAssignmentTarget(target, scope, ctx, parent, key) {
  if (!target) return;
  if (target.type === "Identifier") { if (!scope.has(target.name)) record(ctx, target, parent, key, true); return; }
  if (target.type === "ObjectPattern") {
    for (const property of target.properties) {
      if (property.type === "RestElement") visitAssignmentTarget(property.argument, scope, ctx, property, "argument");
      else { if (property.computed) visit(property.key, scope, ctx, property, "key"); visitAssignmentTarget(property.value, scope, ctx, property, "value"); }
    }
  } else if (target.type === "ArrayPattern") target.elements.forEach((element) => visitAssignmentTarget(element, scope, ctx, target, "elements"));
  else if (target.type === "AssignmentPattern") { visitAssignmentTarget(target.left, scope, ctx, target, "left"); visit(target.right, scope, ctx, target, "right"); }
  else if (target.type === "RestElement") visitAssignmentTarget(target.argument, scope, ctx, target, "argument");
  else visit(target, scope, ctx, parent, key);
}

function visitChildren(node, scope, ctx) {
  for (const key of Object.keys(node)) {
    if (key === "start" || key === "end" || key === "loc" || key === "range") continue;
    const child = node[key];
    if (Array.isArray(child)) { for (const item of child) if (item && typeof item.type === "string") visit(item, scope, ctx, node, key); }
    else if (child && typeof child.type === "string") visit(child, scope, ctx, node, key);
  }
}

function visitStatements(statements, scope, ctx, parent) {
  for (const statement of statements) visit(statement, scope, ctx, parent, "body");
}

function visitFunction(fn, outer, ctx) {
  const scope = new Scope(outer);
  if (fn.type === "FunctionExpression" && fn.id) scope.declare(fn.id.name);
  if (fn.type !== "ArrowFunctionExpression") scope.declare("arguments");
  for (const param of fn.params) for (const id of bindingIdentifiers(param)) scope.declare(id.name);
  if (fn.body.type === "BlockStatement") { hoistVar(fn.body.body, scope); hoistLexical(fn.body.body, scope); }
  for (const param of fn.params) visitBindingPattern(param, scope, ctx);
  if (fn.body.type === "BlockStatement") visitStatements(fn.body.body, scope, ctx, fn.body);
  else visit(fn.body, scope, ctx, fn, "body");
}

function visitClass(cls, outer, ctx) {
  const scope = new Scope(outer);
  if (cls.id) scope.declare(cls.id.name);
  if (cls.superClass) visit(cls.superClass, scope, ctx, cls, "superClass");
  for (const member of cls.body.body) {
    if (member.type === "StaticBlock") {
      const block = new Scope(scope);
      hoistVar(member.body, block);
      hoistLexical(member.body, block);
      visitStatements(member.body, block, ctx, member);
      continue;
    }
    if (member.computed) visit(member.key, scope, ctx, member, "key");
    if (!member.value) continue;
    if (member.type === "MethodDefinition") { if (!ctx.deferFunctions) visitFunction(member.value, scope, ctx); }
    else if (!ctx.deferFunctions || member.static) visit(member.value, scope, ctx, member, "value");
  }
}

function visit(node, scope, ctx, parent, key) {
  if (!node || typeof node.type !== "string") return;
  switch (node.type) {
    case "Identifier":
      if (isReferencePosition(parent, key) && !scope.has(node.name)) record(ctx, node, parent, key, false);
      return;
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression": {
      const invoked = (parent?.type === "CallExpression" || parent?.type === "NewExpression") && key === "callee";
      if (ctx.deferFunctions && !invoked) return;
      visitFunction(node, scope, ctx);
      return;
    }
    case "ClassDeclaration":
    case "ClassExpression":
      visitClass(node, scope, ctx);
      return;
    case "BlockStatement":
    case "StaticBlock": {
      const block = new Scope(scope);
      hoistLexical(node.body, block);
      visitStatements(node.body, block, ctx, node);
      return;
    }
    case "SwitchStatement": {
      visit(node.discriminant, scope, ctx, node, "discriminant");
      const block = new Scope(scope);
      for (const switchCase of node.cases) hoistLexical(switchCase.consequent, block);
      for (const switchCase of node.cases) { visit(switchCase.test, block, ctx, switchCase, "test"); visitStatements(switchCase.consequent, block, ctx, switchCase); }
      return;
    }
    case "ForStatement": {
      const head = new Scope(scope);
      if (node.init?.type === "VariableDeclaration" && node.init.kind !== "var") hoistLexical([node.init], head);
      visit(node.init, head, ctx, node, "init");
      visit(node.test, head, ctx, node, "test");
      visit(node.update, head, ctx, node, "update");
      visit(node.body, head, ctx, node, "body");
      return;
    }
    case "ForInStatement":
    case "ForOfStatement": {
      const head = new Scope(scope);
      if (node.left.type === "VariableDeclaration") {
        if (node.left.kind !== "var") hoistLexical([node.left], head);
        for (const d of node.left.declarations) visitBindingPattern(d.id, head, ctx);
      } else visitAssignmentTarget(node.left, head, ctx, node, "left");
      visit(node.right, head, ctx, node, "right");
      visit(node.body, head, ctx, node, "body");
      return;
    }
    case "CatchClause": {
      const handler = new Scope(scope);
      if (node.param) { for (const id of bindingIdentifiers(node.param)) handler.declare(id.name); visitBindingPattern(node.param, handler, ctx); }
      visit(node.body, handler, ctx, node, "body");
      return;
    }
    case "VariableDeclaration":
      for (const d of node.declarations) { visitBindingPattern(d.id, scope, ctx); visit(d.init, scope, ctx, d, "init"); }
      return;
    case "AssignmentExpression":
      visitAssignmentTarget(node.left, scope, ctx, node, "left");
      visit(node.right, scope, ctx, node, "right");
      return;
    case "UpdateExpression":
      visitAssignmentTarget(node.argument, scope, ctx, node, "argument");
      return;
    case "ImportDeclaration":
      return;
    case "ExportNamedDeclaration":
      if (node.declaration) visit(node.declaration, scope, ctx, node, "declaration");
      else if (!node.source) for (const specifier of node.specifiers) visit(specifier.local, scope, ctx, specifier, "local");
      return;
    case "ExportAllDeclaration":
      return;
    case "LabeledStatement":
      visit(node.body, scope, ctx, node, "body");
      return;
    case "BreakStatement":
    case "ContinueStatement":
    case "MetaProperty":
      return;
    default:
      visitChildren(node, scope, ctx);
  }
}

// Identifier references not declared inside `root` (a Program, a function or an expression).
// Each entry: { name, start, end, write, call }. `call` marks a direct call, `new` or tag.
export function freeReferences(root, { deferFunctions = false } = {}) {
  const ctx = { deferFunctions, found: [] };
  if (root.type === "Program") {
    const scope = new Scope(null);
    hoistVar(root.body, scope);
    hoistLexical(root.body, scope);
    visitStatements(root.body, scope, ctx, root);
  } else if (FUNCTION_TYPES.has(root.type)) visitFunction(root, new Scope(null), ctx);
  else if (root.type === "ClassDeclaration" || root.type === "ClassExpression") visitClass(root, new Scope(null), ctx);
  else visit(root, new Scope(null), ctx, null, null);
  return ctx.found;
}

// The serialized client functions: `name.toString()` and `${name}` where `name` is a top-level
// function declaration. Returns [{ target, site, start }] with `site` the enclosing top-level name.
export function serializationSites(program) {
  const declarations = topLevelDeclarations(program);
  const functions = new Set(declarations.filter((d) => d.kind === "function").flatMap((d) => d.names));
  const sites = [];
  for (const declaration of declarations) {
    const site = declaration.names[0] ?? `(statement ${declaration.index})`;
    const references = new Set(freeReferences(declaration.node).map((r) => r.start));
    const walkNode = (node) => {
      if (!node || typeof node.type !== "string") return;
      if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && !node.callee.computed && node.callee.property.name === "toString" && node.arguments.length === 0
        && node.callee.object.type === "Identifier" && functions.has(node.callee.object.name) && references.has(node.callee.object.start)) {
        sites.push({ target: node.callee.object.name, site, start: node.start, form: "toString" });
      }
      if (node.type === "TemplateLiteral") {
        for (const expression of node.expressions) {
          if (expression.type === "Identifier" && functions.has(expression.name) && references.has(expression.start)) sites.push({ target: expression.name, site, start: expression.start, form: "template" });
        }
      }
      for (const key of Object.keys(node)) {
        const child = node[key];
        if (Array.isArray(child)) child.forEach(walkNode);
        else if (child && typeof child.type === "string") walkNode(child);
      }
    };
    walkNode(declaration.statement);
  }
  return sites;
}
