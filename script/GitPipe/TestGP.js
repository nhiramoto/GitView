var GitPipe = require('./GitPipe');

var pipe = new GitPipe();
pipe.openRepository('../../../Tests/git/simplegit-progit').then(() => {
    console.log('db:', pipe.getDb())
    console.log('repoRec:', pipe.getDb().getRepository());
    console.log('end!');
});

