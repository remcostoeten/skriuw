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

const eolRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require trailing newline at end of file',
      category: 'Style',
    },
  },
  create(context) {
    return {
      Program(node) {
        const sourceCode = context.getSourceCode();
        const fullText = sourceCode.getText();
        
        if (!fullText.endsWith('\n')) {
          context.report({
            node,
            message: 'File must end with a trailing newline',
          });
        }
      },
    };
  },
};

const noNamedExportsRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Only allow default exports for page/view files and view functions',
      category: 'Style',
    },
  },
  create(context) {
    const filename = context.getFilename();
    const isPageOrViewFile = filename.includes('page') || filename.includes('view');
    
    if (!isPageOrViewFile) {
      return {};
    }

    return {
      ExportNamedDeclaration(node) {
        context.report({
          node,
          message: 'Use default export for page/view files',
        });
      },
      ExportSpecifier(node) {
        context.report({
          node,
          message: 'Use default export for page/view files',
        });
      },
    };
  },
};

const noNamedViewFunctionExports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Only allow default exports for functions containing "view" in name',
      category: 'Style',
    },
  },
  create(context) {
    return {
      FunctionDeclaration(node) {
        if (node.id && node.id.name && node.id.name.toLowerCase().includes('view')) {
          for (const stmt of node.parent.body || []) {
            if (stmt.type === 'ExportNamedDeclaration') {
              context.report({
                node: stmt,
                message: 'Use default export for view functions',
              });
            }
          }
        }
      },
    };
  },
};

const kebabCaseFilename = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce kebab-case filenames',
      category: 'Style',
    },
    fixable: 'code',
  },
  create(context) {
    const filename = context.getFilename();
    const basename = filename.split('/').pop();
    
    const kebabCasePattern = /^[a-z0-9]+(-[a-z0-9]+)*\.tsx?$/;
    
    if (!kebabCasePattern.test(basename)) {
      const suggestedName = basename
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
      
      context.report({
        message: `Filename must be kebab-case. Rename to "${suggestedName}"`,
      });
    }
  },
};

module.exports = {
  rules: {
    'no-arrow-functions': noArrowFunctions,
    'props-naming': propsNamingRule,
    'eol': eolRule,
    'no-named-exports-page-view': noNamedExportsRule,
    'no-named-view-function-exports': noNamedViewFunctionExports,
    'kebab-case-filename': kebabCaseFilename,
  },
};
