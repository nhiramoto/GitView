const GitPipe = require('./GitPipe');

var pipe = new GitPipe();
pipe.openRepository('../../../IHM/n-hub').then(() => {
    //console.log('db:', pipe.getDb());
    return pipe.parseCommitsHistory();
}).then(() => {
    //console.log('commits.length:', pipe.getDb().commits.length);
    //console.log('commits:', pipe.getDb().commits);
    //console.log('saved:', pipe.save());
    return pipe.diffCommitsHistory();
}).then(() => {
    console.log('diffs.length:', pipe.diffs.length);
    console.log('diffs:', pipe.diffs);
    console.log('saved:', pipe.save());
}).catch((err) => {
    if (err) console.error('Error:', err);
});

