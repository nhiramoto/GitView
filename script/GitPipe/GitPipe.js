const nodegit = require('nodegit');
const path = require('path');
const fs = require('fs');
const Database = require('./JSONDatabase');

/**
 * Módulo para obtenção dos dados do repositório.
 * @constructor
 */
function GitPipe() {
    this.repository = null;
    this.db = null;
    this.diffRecs = [];
    this.diffs = [];
}

/**
 * Analisa o objeto patch.
 * @param  {NodeGit.ConvenientPatch} patch Objeto patch a ser analisado.
 * @return {Promise(JSONDatabase.FileRecord)} Um promise que retorna um JSONDatabase.FileJSONDatabase.
 */
GitPipe.prototype.parsePatch = function (patch) {
    console.log('parsePatch() >');
    let newFileId = patch.newfile().id().toString();
    let newFilePath = patch.newFile().path();
    let newFileName = path.basename(newFilePath);
    let oldFileId = patch.oldFile().id().toString();
    let patchStatus = null;
    if (oldFilePath === newFilePath) {
        if (patch.isAdded()) {
            patchStatus = JSONDatabase.FILESTATUS.ADDED;
        } else if (patch.isDeleted()) {
            patchStatus = JSONDatabase.FILESTATUS.DELETED;
        } else if (patch.isModified()) {
            patchStatus = JSONDatabase.FILESTATUS.MODIFIED;
        }
    } else {
        patchStatus = JSONDatabase.FILESTATUS.MOVED;
    }
    let fileRec = new JSONDatabase.FileRecord();
    fileRec.id = newFileId;
    fileRec.name = newFileName;
    fileRec.path = newFilePath;
    fileRec.idOldFile = oldFileId;
    fileRec.status = patchStatus;
    console.log('parsePatch() <');
    return patch.hunks().then((hunks) => {
        let hunkPromises = [];
        hunks.forEach((hunk) => {
            hunkPromises.push(hunk.lines());
        });
        return Promise.all(hunkPromises);
    }).then((linesList) => {
        linesList.forEach((lines) => lines.forEach((line) => {
            let lineRec = new JSONDatabase.LineRecord();
            lineRec.oldLineNum = line.oldLineno();
            lineRec.newLineNum = line.newLineno();
            let sign = String.fromCharCode(line.origin());
            if (sign == '+') {
                lineRec.status = JSONDatabase.LINESTATUS.ADDED;
            } else if (sign == '-') {
                lineRec.status = JSONDatabase.LINESTATUS.DELETED;
            }
            fileRec.modifiedLines.push(lineRec);
        }));
        return fileRec;
    });
};

GitPipe.prototype.parseDiffs = function () {
    let patchesPromises = [];
    for (let i = 0; i < this.diffs.length; i++) {
        let diff = this.diffs[i];
        let prom = diff.patches().then((patches) => {
            let patchPromises = [];
            patches.forEach((patch) => {
                let patchProm = this.parsePatch(patch);
                if (patchProm != null) {
                    patchPromises.push(patchProm);
                }
            });
            return Promise.all(patchPromises);
        });
        patchesPromises.push(prom);
    }
    return Promise.all(patchesPromises);
};

GitPipe.prototype.diffCommits = function (oldCommit, recentCommit) {
    let diffRec = new JSONDatabase.DiffRecord();
    diffRec.idCommit1 = oldCommit.sha();
    diffRec.idCommit2 = recentCommit.sha();
    let tree1, tree2;
    return oldCommit.getTree().then((t1) => {
        tree1 = t1;
        return recentCommit.getTree();
    }).then((t2) => {
        tree2 = t2;
        return nodegit.Diff.treeToTree(this.repository, tree1, tree2);
    }).then((diff) => {
        return diff.patches();
    }).then((patches) => {
        let patchPromises = [];
        patches.forEach((patch) => patchPromises.push(this.parsePatch(patch)));
        return Promise.all(patchPromises);
    }).then((filesRec) => {
        let entryPromises = [];
        let idRootDir = null;
        filesRec.forEach((fileRec) => {
            this.db.addFile(fileRec);
            let dirPath = path.dirname(fileRec.path);
            while (dirPath.length > 0) {
                let p = recentCommit.getEntry(dirPath).then((treeEntry) => {
                    console.assert(treeEntry.isTree(), 'diffCommits(): treeEntry is not a tree.');
                    return treeEntry.getTree();
                }).then((tree) => {
                    let treeId = tree.id().toString();
                    let foundDirRec = this.db.findDirectory(treeId);
                    if (foundDirRec == undefined) {
                        let newDirRec = new JSONDatabase.DirectoryRecord();
                        newDirRec.id = treeId;
                        newDirRec.path = tree.path();
                        newDirRec.name = path.basename(newDirRec.path);
                        newDirRec.entries.push(fileRec.id);
                        this.db.addDirectory(newDirRec);
                        idRootDir = newDirRec.id;
                    } else {
                        console.assert(foundDirRec.path === dirPath, 'diffCommits(): Different paths.');
                        foundDirRec.entries.push(fileRec.id);
                        idRootDir = foundDirRec.id;
                    }
                });
                entryPromises.push(p);
                dirPath = path.dirname(dirPath);
            }
        });
        return Promise.all(entryPromises).then(() => {
            diffRec.idRootDir = idRootDir;
            this.db.addDiff(diffRec);
        });
    });
};

GitPipe.prototype.diffCommitWithParents = function (commit) {
    let commitId = commit.sha();
    let parentTree = null;
    return commit.getTree().then((commitTree) => {
        return commit.getParents();
    }).then((parents) => {
        let parentsPromises = [];
        parents.forEach((parent) => {
            let parentId = parent.sha();
            let diffRec = new JSONDatabase.DiffRecord();
            diffRec.idOldCommit = parentId;
            diffRec.idRecentCommit = commitId;
            this.diffRecs.push(diffRec);
            let prom = parent.getTree().then((parentTree) => {
                let diff = nodegit.Diff.treeToTree(parentTree, commitTree);
                this.diffs.push(diff);
                return diffCommitWithParents(parent);
            });
            parentsPromises.push(prom);
        });
        return Promise.all(parentsPromises);
    });
};

GitPipe.prototype.diffCommitsHistory = function () {
    let repoRec = this.db.getRepository();
    let headCommitId = repoRec.head;
    let commit = this.db.findCommit(headCommitId);
    diffCommitWithParents(commit);
};

GitPipe.prototype.parseCommit = function (commit) {
    let commitRec = new JSONDatabase.CommitRecord(commit);
    this.db.addCommit(commitRec);
    let authorSign = commit.author();
    let authorRec = new JSONDatabase.AuthorRecord(authorSign);
    this.db.addAuthor(authorRec);
    return commit.getParents().then((parents) => {
        let parseParentPromises = [];
        parents.forEach((parent) => {
            let prom = this.parseCommit(parent);
            if (prom != null) {
                parseParentPromises.push(prom);
            }
        });
        return Promise.all(parseParentPromises);
    });
};

GitPipe.prototype.parseCommitsHistory = function () {
    return this.repository.getReferences().then((references) => {
        let getCommitPromises = [];
        references.forEach((reference) => {
            let commitId = reference.target();
            let savedCommit = this.db.findCommit(commitId);
            if (savedCommit == undefined) {
                getCommitPromises.push(this.repository.getCommit(commitId));
            }
        });
        return Promise.all(getCommitPromises);
    }).then((commits) => {
        let parseCommitPromises = [];
        commits.forEach((commit) => {
            let prom = this.parseCommit(commit);
            if (prom != null) {
                parseCommitPromises.push(prom);
            }
        });
        return Promise.all(parseCommitPromises);
    });
};

GitPipe.prototype.parseReference = function (reference) {
    console.log('parseReference() >');
    if (reference.isBranch()) {
        var commitSha = '' + reference.target();
        console.log('   reference: ' + reference.toString() + ' -> ' + commitSha);
        console.log('parseReference() <');
        return this.repository.getCommit(commitSha);
    } else {
        console.log('   *não é branch!');
        console.log('parseReference() <');
        return null;
    }
};

GitPipe.prototype.parseRepo = function (repositoryPath) {
    let pathToRepo = path.resolve(repositoryPath);
    let repoRec = null;
    nodegit.Repository.open(pathToRepo).then((repository) => {
        this.repository = repository;
        repoRec = new JSONDatabase.RepositoryRecord(repository);
        fs.mkdir('./data');
        this.db = new JSONDatabase('./data/' + this.repoRec.name);
        return this.repository.head();
    }).then((head) => {
        repoRec.head = '' + head.target();
        console.log('repository:', repoRec);
        this.db.setRepository(repoRec);
        return this.repository.getReferences(nodegit.Reference.TYPE.OID);
    }).then((references) => {
        let getCommitPromises = [];
        references.forEach((reference) => {
            let res = this.parseReference(reference);
            if (res) getCommitPromises.push(res);
        });
        return Promise.all(getCommitPromises);
    }).then((commits) => {
        commits.forEach((commit) => {
            console.log('first commit:', commit.sha());
            let history = commit.history();
            let commitPromises = [];
            history.on('commit', (commit) => {
                console.log('  commit step:', commit.sha());
                commitPromises.push(this.parseCommit(commit));
            });
            history.on('error', (err) => {
                if (err) console.error('Error:', err);
            });
            history.start();
        });
        return Promise.all(commitPromises);
    }).then(() => {

    }).catch((err) => {
        if (err) console.error('Error:', err);
    });
};

/**
 * Abre o repositório usando nodegit.
 * @param {String} repositoryPath - Caminho do repositório.
 */
GitPipe.prototype.openRepository = function (repositoryPath) {
    let pathToRepo = path.resolve(repositoryPath);
    let repoRec = null;
    let dbPath = null;
    return nodegit.Repository.open(pathToRepo).then((repository) => {
        this.repository = repository;
        fs.mkdir('./data');
        return this.repository.head();
    }).then((head) => {
        let headCommitId = '' + head.target();
        repoRec = new JSONDatabase.RepositoryRecord(this.repository);
        repoRec.head = headCommitId;
        dbPath = './data/' + repoRec.name
        this.db = new JSONDatabase(dbPath);
        this.db.setRepository(repoRec);
        return dbPath;
    });
};

module.exports = GitPipe;
