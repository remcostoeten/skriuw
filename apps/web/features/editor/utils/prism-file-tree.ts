import Prism from 'prismjs'

Prism.languages.tree = {
    'tree-structure-guide': {
        pattern: /^[\s\u00A0]*[│|]/m,
        alias: 'punctuation'
    },
    'tree-connector': {
        pattern: /[├└][─-]+/,
        alias: 'punctuation'
    },
    'directory-name': {
        pattern: /([├└][─-]+\s*)([a-zA-Z0-9_\-.]+\/?)/,
        lookbehind: true,
        alias: 'keyword' // Or 'variable' for folder color
    },
    'comment': {
        pattern: /#.*/,
        alias: 'comment'
    }
}

// Map 'file-tree' alias to 'tree'
Prism.languages['file-tree'] = Prism.languages.tree
