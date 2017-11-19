const nodegit = require('nodegit');
const path = require('path');
const fs = require('fs');
const JSONDatabase = require('./JSONDatabase');

/**
 * Módulo para obtenção dos dados do repositório.
 * @constructor
 */
function GitPipe() {
    this.nodegitRepository = null;
    this.db = null;
    this.diffRecs = [];
    this.diffs = [];
}

/**
 * Analisa o objeto patch.
 * @param  {NodeGit.ConvenientPatch} patch Objeto patch a ser analisado.
 * @return {Promise} Um promise que retorna um JSONDatabase.DiffFileRecord.
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
            patchStatus = JSONDatabase.DIFFFILESTATUS.ADDED;
        } else if (patch.isDeleted()) {
            patchStatus = JSONDatabase.DIFFFILESTATUS.DELETED;
        } else if (patch.isModified()) {
            patchStatus = JSONDatabase.DIFFFILESTATUS.MODIFIED;
        }
    } else {
        patchStatus = JSONDatabase.DIFFFILESTATUS.MOVED;
    }
    let fileRec = new JSONDatabase.DiffFileRecord();
    fileRec.id = newFileId;
    fileRec.name = newFileName;
    fileRec.path = newFilePath;
    fileRec.oldFileId = oldFileId;
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
            let oldLineNum = line.oldLineno();
            let newLineNum = line.newLineno();
            let lineStatus;
            let lineRec = new JSONDatabase.LineRecord();
            let sign = String.fromCharCode(line.origin());
            if (sign == '+') {
                lineStatus = JSONDatabase.LINESTATUS.ADDED;
            } else if (sign == '-') {
                lineStatus = JSONDatabase.LINESTATUS.DELETED;
            }
            lineRec.oldLineNum = oldLineNum;
            lineRec.newLineNum = newLineNum;
            lineRec.status = lineStatus;
            fileRec.modifiedLines.push(lineRec);
        }));
        return fileRec;
    });
};

GitPipe.prototype.createDiffDirectories = function (filePath, commit, childId) {
    if (!fs.lstatSync(filePath).isDirectory()) {
        filePath = path.dirname(filePath);
    }
    let createDiffDirectoryPromises = [];
    childId = null;
    while (filePath.length > 0) {
        let name = path.basename(filePath);
        let prom = (function (self, filePath, name, childId) {
            return commit.getEntry(name).then((entry) => {
                console.assert(entry.isTree(), 'GitPipe#createDiffDirectories: entry is not a tree.');
                return entry.getTree();
            }).then((tree) => {
                let treeId = tree.id().toString();
                let foundDir = self.db.findDirectory(treeId);
                if (foundDir == undefined) {

                } else {
                }
            });
        })(this, filePath, name, childId);
        createDiffDirectoryPromises.push(prom);
    }
    return Promise.all(createDiffDirectoryPromises);
};

GitPipe.prototype.createDiffDirectories = function (commit, filePath, childId) {
    if (filePath.length === 0) {
        return null;
    } else if (!fs.lstatSync(filePath).isDirectory()) {
        return this.createDiffDirectories(commit, path.dirname(filePath), childId);
    } else {
        return commit.getEntry(name).then((entry) => {
            console.assert(entry.isTree(), 'GitPipe#createDiffDirectories: entry is not a tree.');
            return entry.getTree();
        }).then((tree) => {
            let treeId = tree.id().toString();
            let foundDiffDir = this.db.findDirectory(treeId);
            if (foundDiffDir == undefined) {
                let newDiffDir = new JSONDatabase.DiffDirectoryRecord();
                newDiffDir.id = treeId;
                newDiffDir.name = path.basename(filePath);
                newDiffDir.path = filePath;
                newDiffDir.entries.push(childId);
            } else {
                foundDiffDir.entries.push(childId);
            }
            return this.createDiffDirectories(commit, path.dirname(filePath), treeId);
        });
    }
};

GitPipe.prototype.parseDiffs = function () {
    let patchesPromises = [];
    for (let i = 0; i < this.diffs.length; i++) {
        let diff = this.diffs[i];
        let prom1 = (function (self, i, diff) {
            return diff.patches().then((patches) => {
                let patchPromises = [];
                patches.forEach((patch) => {
                    let prom2 = self.parsePatch(patch);
                    if (prom2 != null) {
                        patchPromises.push(prom2);
                    }
                });
                return Promise.all(patchPromises);
            }).then((listDiffFileRec) => {
                listDiffFileRec.forEach((diffFileRec) => {
                    let diffFilePath = diffFileRec.path;
                    let commit = self.repository.getCommit(diffRec.recentCommitId);
                    let rootDirId = createDiffDirectories(diffFilePath, commit, diffFileRec.id);
                    let diffRec = self.diffRecs[i];
                    diffRec.rootDirId = rootDirId;
                    self.db.addDiff(diffRec);
                });
            });
        })(this, i, diff);
        patchesPromises.push(prom1);
    }
    this.diffs = null;
    this.diffRecs = null;
    return Promise.all(patchesPromises);
};

GitPipe.prototype.diffCommitWithParents = function (commit) {
    console.log('> diffCommitWithParents...');
    console.log('commit:', commit);
    let commitId = commit.sha();
    let commitTree = null;
    let parentId = null;
    let parentTree = null;
    let diffRec = null;
    return commit.getTree().then((tree1) => {
        commitTree = tree1;
        return commit.getParents();
    }).then((parents) => {
        console.log('  parents:', parents);
        let parentsPromises = [];
        parents.forEach((parent) => {
            parentId = parent.sha();
            console.log('    parentId:', parentId);
            let foundDiff = this.diffRecs.find((diffRec) =>
                diffRec.oldCommitId === parentId && diffRec.recentCommitId === commitId);
            if (foundDiff == undefined) {
                diffRec = new JSONDatabase.DiffRecord();
                diffRec.oldCommitId = parentId;
                diffRec.recentCommitId = commitId;
                console.log('    diffRec:', diffRec);
                this.diffRecs.push(diffRec);
                let prom = parent.getTree().then((tree2) => {
                    parentTree = tree2;
                    return nodegit.Diff
                        .treeToTree(this.nodegitRepository, parentTree, commitTree)
                }).then((diff) => {
                    console.log('      diff:', diff);
                    this.diffs.push(diff);
                    return this.diffCommitWithParents(parent);
                });
                parentsPromises.push(prom);
            }
        });
        console.log('< diffCommitWithParents');
        return Promise.all(parentsPromises);
    });
};

GitPipe.prototype.diffCommitsHistory = function () {
    console.log('> diffCommitsHistory');
    return this.nodegitRepository.getReferences(nodegit.Reference.TYPE.OID).then((references) => {
        console.log('  * references:', references);
        let getCommitPromises = [];
        references.forEach((reference) => {
            let isbranch = reference.isBranch();
            if (isbranch) {
                let commitId = reference.target();
                let prom = this.nodegitRepository.getCommit(commitId);
                if (prom != null) getCommitPromises.push(prom);
            }
        });
        return Promise.all(getCommitPromises);
    }).then((commits) => {
        console.log('  * commits:', commits);
        let diffCommitsPromises = [];
        commits.forEach((commit) => {
            let prom = this.diffCommitWithParents(commit);
            if (prom != null) diffCommitsPromises.push(prom);
        });
        return Promise.all(diffCommitsPromises);
    });
};

GitPipe.prototype.parseCommit = function (commit) {
    let commitRec = new JSONDatabase.CommitRecord(commit);
    let authorSign = commit.author();
    let authorRec = new JSONDatabase.AuthorRecord(authorSign);
    let authorEmail = authorRec.email;
    commitRec.authorEmail = authorEmail;
    this.db.addCommit(commitRec);
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
    console.log('> parseCommitsHistory');
    return this.nodegitRepository.getReferences(nodegit.Reference.TYPE.OID).then((references) => {
        let getCommitPromises = [];
        references.forEach((reference) => {
            if (reference.isBranch()) {
                let commitId = reference.target();
                getCommitPromises.push(this.nodegitRepository.getCommit(commitId));
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

/**
 * Abre o repositório usando nodegit e salva na base de dados.
 * @param {String} repositoryPath - Caminho do repositório.
 * @return {Promise} Promise que retorna o caminho da base de dados.
 */
GitPipe.prototype.openRepository = function (repositoryPath) {
    let pathToRepo = path.resolve(repositoryPath);
    let repoRec = null;
    let dbPath = null;
    return nodegit.Repository.open(pathToRepo).then((repository) => {
        this.nodegitRepository = repository;
        // Subdiretório onde todas as bases de dados são salvas (uma para cada repositório)
        fs.mkdir('./data', (err) => {});
        return this.nodegitRepository.head();
    }).then((head) => {
        let headCommitId = '' + head.target();
        repoRec = new JSONDatabase.RepositoryRecord(this.nodegitRepository);
        repoRec.head = headCommitId;
        dbPath = './data/' + repoRec.name;
        this.db = new JSONDatabase(dbPath);
        this.db.setRepository(repoRec);
        return dbPath;
    }).catch((err) => {
        if (err) console.log('Error:', err);
    });
};

GitPipe.prototype.setNodegitRepository = function (nodegitRepository) {
    this.nodegitRepository = nodegitRepository;
};

GitPipe.prototype.getNodegitRepository = function () {
    return this.nodegitRepository;
};

GitPipe.prototype.setDb = function (db) {
    this.db = db;
};

GitPipe.prototype.getDb = function () {
    return this.db;
};

module.exports = GitPipe;
