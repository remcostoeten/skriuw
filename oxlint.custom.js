const noArrowFunctions = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow arrow functions, prefer function declarations',
      category: 'Style',
    },
    fixable: 'code',
  },
  create(context) {
    return {
      ArrowFunctionExpression(node) {
        const sourceCode = context.getSourceCode();
        const parent = node.parent;

        if (
          parent.type === 'VariableDeclarator' &&
          parent.id.type === 'Identifier' &&
          (parent.parent.kind === 'const' || parent.parent.kind === 'let')
        ) {
          context.report({
            node,
            message: 'Use function declaration instead of arrow function',
            fix(fixer) {
              const params = sourceCode.getText(node.params);
              const body = sourceCode.getText(node.body);
              let fixedBody = body;
              if (node.body.type !== 'BlockStatement') {
                fixedBody = `{ return ${body}; }`;
              }
              return fixer.replaceText(parent.parent, `function ${parent.id.name}(${params}) ${fixedBody}`);
            },
          });
        }
      },
    };
  },
};

const propsNamingRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Single unexported type must be named Props',
      category: 'Style',
    },
  },
  create(context) {
    return {
      Program(node) {
        const types = [];
        const interfaces = [];

        for (const stmt of node.body) {
          if (stmt.type === 'TSTypeAliasDeclaration' && !stmt.declare) {
            if (!stmt.exported) {
              types.push(stmt);
            }
          }
          if (stmt.type === 'TSInterfaceDeclaration' && !stmt.declare) {
            if (!stmt.exported) {
              interfaces.push(stmt);
            }
          }
        }

        const totalUnExported = types.length + interfaces.length;

        if (totalUnExported === 1) {
          const unexported = types[0] || interfaces[0];
          const name = unexported.id.name;

          if (name !== 'Props') {
            context.report({
              node: unexported.id,
              message: 'Single unexported type/interface must be named "Props"',
            });
          }
        }
      },
    };
  },
};

module.exports = {
  rules: {
    'no-arrow-functions': noArrowFunctions,
    'props-naming': propsNamingRule,
  },
};
