const GitPipe = require('./GitPipe');

var pipe = new GitPipe();
pipe.openRepository('../../../Tests/git/simplegit-progit').then(() => {
    console.log('db:', pipe.getDb())
    console.log('repoRec:', pipe.getDb().getRepository());
    return pipe.parseCommitsHistory();
}).then(() => {
    console.log('commits.length:', pipe.getDb().commits.length);
    console.log('commits:', pipe.getDb().commits);
    return pipe.diffCommitsHistory();
}).then(() => {
    console.log('diffs.length:', pipe.diffs.length);
    console.log('diffRecs.length:', pipe.diffRecs.length);
    console.log('diffRecs:', pipe.diffRecs);
}).catch((err) => {
    if (err) console.error('Error:', err);
});

