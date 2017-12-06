const GitPipe = require('./GitPipe');

var pipe = new GitPipe();
pipe.openRepository('../../../Tests/git/simplegit-progit').then(() => {
    return pipe.parseCommitsHistory();
}).then(() => {
    return pipe.diffCommitsHistory();
}).then(() => {
    return pipe.parseDiffs();
}).then(() => {
    console.log('dbPath:', pipe.getDb().getRootPath());
    console.log('repository:', pipe.getDb().getRepository());
    console.log('commits.length:', pipe.getDb().commits.length);
    console.log('authors.length:', pipe.getDb().authors.length);
    console.log('diffs.length:', pipe.getDb().diffs.length);
    console.log('dirs.length:', pipe.getDb().dirs.length);
    console.log('files.length:', pipe.getDb().files.length);
    console.log('saved:', pipe.save());
}).then(() => {
    
}).catch((err) => {
    if (err) console.error('Error:', err);
});
