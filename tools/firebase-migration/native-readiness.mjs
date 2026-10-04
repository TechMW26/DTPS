// Exit nonzero until application runtime code and dependencies are free of MongoDB.
// One-time source readers under tools/firebase-migration are intentionally separate.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const forbidden = /^(mongoose|mongodb|bson)(\/|$)/;
const matches = [];
function inspect(file) {
  const content = fs.readFileSync(file,'utf8');
  const ast = ts.createSourceFile(file,content,ts.ScriptTarget.Latest,true);
  function visit(node) {
    let specifier;
    if(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier=node.moduleSpecifier;
    else if(ts.isCallExpression(node) && (node.expression.kind===ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text==='require'))) specifier=node.arguments[0];
    if(specifier && ts.isStringLiteral(specifier) && forbidden.test(specifier.text)) {
      matches.push({file,line:ast.getLineAndCharacterOfPosition(node.getStart()).line+1,module:specifier.text});
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);
}
function walk(dir) {
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const name=path.join(dir,entry.name);
    if(entry.isDirectory()) walk(name);
    else if(/\.[cm]?[jt]sx?$/.test(name)) inspect(name);
  }
}
walk('src');
walk('tests');
walk('tools');
for(const file of ['socket-server.js','next.config.ts','next.config.js','next.config.mjs']) if(fs.existsSync(file)) inspect(file);
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const dependencies=Object.keys({...pkg.dependencies,...pkg.devDependencies}).filter(name=>forbidden.test(name));
const result={ready:matches.length===0 && dependencies.length===0,runtimeFiles:new Set(matches.map(m=>m.file)).size,imports:matches,dependencies};
console.log(JSON.stringify(result,null,2));
if(!result.ready) process.exitCode=1;
