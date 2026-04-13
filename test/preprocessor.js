const tsc = require('typescript');
const tsConfig = require('../tsconfig.json');
const path = require('path');

module.exports = {
  process(src, filepath) {
    if (filepath.endsWith('.ts')) {
      const transpiled = tsc.transpileModule(src, {
        compilerOptions: {
          ...tsConfig.compilerOptions,
          sourceMap: false,
          inlineSourceMap: false,
          inlineSources: false,
        },
        fileName: filepath,
        reportDiagnostics: false,
      });
      return {
        code: transpiled.outputText,
      };
    }
    return { code: src };
  },
};
