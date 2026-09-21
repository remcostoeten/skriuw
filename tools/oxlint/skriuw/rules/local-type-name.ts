import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

type TypeDeclaration = ESTree.TSTypeAliasDeclaration | ESTree.TSInterfaceDeclaration;

function topLevelTypeDeclaration(statement: ESTree.Statement | ESTree.Directive | ESTree.ModuleDeclaration) {
  const declaration =
    statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration"
      ? statement.declaration
      : statement;
  if (declaration === null || declaration === undefined) return null;
  if (declaration.type === "TSTypeAliasDeclaration" || declaration.type === "TSInterfaceDeclaration") {
    return { declaration, inlineExport: declaration !== statement };
  }
  return null;
}

function exportedNames(program: ESTree.Program): Set<string> {
  const names = new Set<string>();
  for (const statement of program.body) {
    if (statement.type === "ExportNamedDeclaration" && statement.source === null) {
      for (const specifier of statement.specifiers) {
        if (specifier.local.type === "Identifier") names.add(specifier.local.name);
      }
    }
    if (statement.type === "ExportDefaultDeclaration" && statement.declaration.type === "Identifier") {
      names.add(statement.declaration.name);
    }
  }
  return names;
}

type FunctionNode =
  | ESTree.ArrowFunctionExpression
  | ESTree.FunctionDeclaration
  | ESTree.FunctionExpression;

function functionName(node: FunctionNode): string | null {
  if (node.type !== "ArrowFunctionExpression" && node.id) return node.id.name;
  const parent = node.parent;
  if (parent?.type === "VariableDeclarator" && parent.id.type === "Identifier") return parent.id.name;
  return null;
}

function componentPropsTypeName(node: FunctionNode): string | null {
  const name = functionName(node);
  if (name === null || !/^[A-Z]/.test(name)) return null;
  const [parameter] = node.params;
  if (parameter === undefined) return null;
  const binding = parameter.type === "AssignmentPattern" ? parameter.left : parameter;
  if (binding.type === "RestElement" || binding.type === "TSParameterProperty") return null;
  const annotation = binding.typeAnnotation?.typeAnnotation;
  if (annotation?.type !== "TSTypeReference" || annotation.typeName.type !== "Identifier") {
    return null;
  }
  return annotation.typeName.name;
}

/** Require a module's only type to be named `Props` when it is private and types a component's props. */
export const localTypeNameRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require a module's single, non-exported type to be named `Props` when it types a component's props.",
    },
    messages: {
      localTypeName:
        "`{{name}}` is this module's only type and is not exported, so name it `Props`.",
    },
  },
  create(context) {
    const parameterTypeNames = new Set<string>();
    function recordParameterType(node: FunctionNode) {
      const name = componentPropsTypeName(node);
      if (name !== null) parameterTypeNames.add(name);
    }
    return {
      ArrowFunctionExpression: recordParameterType,
      FunctionDeclaration: recordParameterType,
      FunctionExpression: recordParameterType,
      "Program:exit"(program: ESTree.Program) {
        const declarations: { declaration: TypeDeclaration; inlineExport: boolean }[] = [];
        for (const statement of program.body) {
          const found = topLevelTypeDeclaration(statement);
          if (found !== null) declarations.push(found);
        }
        if (declarations.length !== 1) return;
        const [{ declaration, inlineExport }] = declarations;
        const name = declaration.id.name;
        if (inlineExport || name === "Props" || !parameterTypeNames.has(name)) return;
        if (exportedNames(program).has(name)) return;
        context.report({ node: declaration.id, messageId: "localTypeName", data: { name } });
      },
    };
  },
});
