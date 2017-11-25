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
    let oldFilePath = patch.oldFile().path();
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
    let diffFileRec = new JSONDatabase.DiffFileRecord();
    diffFileRec.id = newFileId;
    diffFileRec.name = newFileName;
    diffFileRec.path = newFilePath;
    diffFileRec.oldFileId = oldFileId;
    diffFileRec.status = patchStatus;
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
            let diffLineRec= new JSONDatabase.LineRecord();
            let sign = String.fromCharCode(line.origin());
            if (sign == '+') {
                lineStatus = JSONDatabase.LINESTATUS.ADDED;
            } else if (sign == '-') {
                lineStatus = JSONDatabase.LINESTATUS.DELETED;
            }
            diffLineRec.oldLineNum = oldLineNum;
            diffLineRec.newLineNum = newLineNum;
            diffLineRec.status = lineStatus;
            diffFileRec.modifiedLines.push(diffLineRec);
        }));
        return diffFileRec;
    });
};

GitPipe.prototype.createDiffDirectories = function (commit, filePath, child) {
    if (filePath.length === 0) {
        return null;
    } else if (!fs.lstatSync(filePath).isDirectory()) {
        return this.createDiffDirectories(commit, path.dirname(filePath), child);
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
                newDiffDir.entries.push(child);
                return this.createDiffDirectories(commit, path.dirname(filePath), newDiffDir);
            } else {
                foundDiffDir.entries.push(child);
                return this.createDiffDirectories(commit, path.dirname(filePath), foundDiffDir);
            }
        });
    }
};

GitPipe.prototype.parseDiffs = function () {
    let patchesPromises = [];
    console.assert(this.diffs.length === this.diffRecs.length, 'Error: diffs length is not equal to diffRecs length.');
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
                    let filePath = diffFileRec.path;
                    let commit = self.nodegitRepository.getCommit(diffRec.recentCommitId);
                    let rootDirId = self.createDiffDirectories(commit, filePath, diffFileRec);
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

/**
 * Cria registro do diff com commits pai.
 * @param {JSONDatabase.CommitRecord} commitRec
 */
GitPipe.prototype.diffCommitWithParents = function (commitRec) {
    console.log('> diffCommitWithParents...');
    console.log('commitRec:', commitRec);
    let commitId = commitRec.id;
    let commitSnapshotId = commitRec.snapshotId;
    let parentIds = commitRec.parents;
    parentIds.forEach((parentId) => {
        let foundDiff = this.diffRecs.find((diffRec) =>
            diffRec.oldCommitId === parentId && diffRec.recentCommitId === commitId);
        if (foundDiff == undefined) {
            let parentRec = this.db.findCommit(parentId);
            let parentSnapshotId = parentRec.snapshotId;
            let diffRec = new JSONDatabase.DiffRecord();
            diffRec.oldCommitId = parentId;
            diffRec.recentCommitId = commitId;
            this.diffRecs.push(diffRec);
            let prom = (function (parentSnapshotId, commitSnapshotId) {
                let parentTree, commitTree;
                return this.nodegitRepository.getTree(parentSnapshotId).then((tree1) => {
                    parentTree = tree1;
                    return this.nodegitRepository.getTree(commitSnapshotId);
                }).then((tree2) => {
                    commitTree = tree2;
                    let diff = nodegit.Diff.treeToTree(this.nodegitRepository, parentTree, commitTree);
                    this.diffs.push(diff);
                });
            })(parentSnapshotId, commitSnapshotId);
        }
    });
};

/**
 * Percorre os commits salvos e cria diffs de cada commit com o commit pai.
 */
GitPipe.prototype.diffCommitsHistory = function () {
    let commitRecs = this.db.getCommits();
    let diffCommitsPromises = [];
    commitRecs.forEach((commitRec) => {
        let prom = this.diffCommitWithParents(commitRec);
        if (prom != null) {
            diffCommitsPromises.push(prom);
        }
    });
    return Promise.all(diffCommitsPromises);
};

/**
 * Cria registro do commit.
 * @param {NodeGit.Commit} commit - Commit a ser analisado.
 */
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
    return this.nodegitRepository.getReferences(nodegit.Reference.TYPE.OID).then((references) => {
        let getCommitPromises = [];
        references.forEach((reference) => {
            let isbranch = reference.isBranch();
            if (isbranch) {
                let commitId = reference.target().toString();
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
        fs.mkdir('./data', () => {});
        return this.nodegitRepository.head();
    }).then((head) => {
        let headCommitId = head.target().toString();
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
