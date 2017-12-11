const util = require('util');
const GitPipe = require('./GitPipe');

var pipe = new GitPipe();
pipe.openRepository('../../../IHM/n-hub').then(() => {
    console.log('dbPath:', pipe.getDb().getRootPath());
    console.log('repository:', pipe.getDb().getRepository());
    return pipe.parseCommitsHistory();
}).then(() => {
    console.log('commits.length:', pipe.getDb().commits.length);
    console.log('authors.length:', pipe.getDb().authors.length);
    return pipe.diffCommitsHistory();
}).then(() => {
    console.log('diffs.length:', pipe.getDb().diffs.length);
    return pipe.parseDiffs();
}).then(() => {
    console.log('dirs.length:', pipe.getDb().dirs.length);
    console.log('files.length:', pipe.getDb().files.length);
    console.log('saved:', pipe.save());
    console.log('* getLastDiffTree:');
    let diffDir = pipe.getLastDiffTree();
    console.log('pipe.diffDir:');
    console.log(util.inspect(diffDir, false, null));
}).then(() => {
    console.log('finish!');
}).catch((err) => {
    if (err) console.error('Error:', err);
});
