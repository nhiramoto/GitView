var GitPipe = require('./GitPipe');

var pipe = new GitPipe();
pipe.openRepo('../../../Tests/git/simplegit-progit');
console.log('repoRec:', pipe.db.getRepository());

