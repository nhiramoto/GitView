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

GitPipe.prototype.save = function () {
    return this.db.saveToDisk();
};

/**
 * Cria registro do arquivo relacionado ao patch.
 * @param  {NodeGit.ConvenientPatch} patch - Objeto patch com os dados do arquivo.
 * @return {Promise} Um promise que retorna um JSONDatabase.FileRecord
 */
GitPipe.prototype.createFile = function (patch) {
    let newFileId = patch.newFile().id().toString();
    let newFilePath = patch.newFile().path();
    let oldFileId = patch.oldFile().id().toString();
    let oldFilePath = patch.oldFile().path();
    let patchStatus = null;
    if (oldFilePath != newFilePath) {
        patchStatus = JSONDatabase.FILESTATUS.MOVED;
    } else if (patch.isAdded()) {
        patchStatus = JSONDatabase.FILESTATUS.ADDED;
    } else if (patch.isDeleted()) {
        patchStatus = JSONDatabase.FILESTATUS.DELETED;
    } else if (patch.isModified()) {
        patchStatus = JSONDatabase.FILESTATUS.MODIFIED;
    } else {
        patchStatus = JSONDatabase.FILESTATUS.UNMODIFIED;
    }
    let statistic = new JSONDatabase.Statistic(0, 0, 0);
    let fileRec = new JSONDatabase.FileRecord();
    fileRec.id = newFileId;
    fileRec.name = path.basename(newFilePath);
    fileRec.path = newFilePath;
    fileRec.oldFileId = oldFileId;
    fileRec.status = patchStatus;
    fileRec.statistic = statistic;
    return patch.hunks().then((hunks) => {
        let hunkPromises = [];
        hunks.forEach((hunk) => {
            hunkPromises.push(hunk.lines());
        });
    }).then((listLines) => listLines.forEach((lines) => {
        lines.forEach((line) => {
            let oldLineNum = line.oldLineno();
            let newLineNum = line.newLineno();
            let lineStatus = null;
            let sign = String.fromCharCode(line.origin());
            if (sign === '-') {
                lineStatus = JSONDatabase.LINESTATUS.DELETED;
                fileRec.statistic.deleted++;
            } else if (sign === '+') {
                lineStatus = JSONDatabase.LINESTATUS.ADDED;
                fileRec.statistic.added++;
            }
            let lineRec = new JSONDatabase.LineRecord();
            lineRec.oldLineNum = oldLineNum;
            lineRec.newLineNum = newLineNum;
            lineRec.status = lineStatus;
            fileRec.lines.push(lineRec);
        });
        return fileRec;
    }));
};

/**
 * Cria registro de diretórios recursivamente (dos filhos à raiz).
 */
GitPipe.prototype.createDirectory = function (commit, dirPath, child) {
    if (dirPath.length <= 0 || dirPath === '.') {
        return null;
    } else {
        return commit.getEntry(dirPath).then((entry) => {
            console.assert(entry.isTree(), 'GitPipe#parsePatch: Error - Entry is not a tree.');
            return entry.getTree();
        }).then((tree) => {
            let treeId = tree.id().toString();
            let foundDirRec = this.db.findDirectory(treeId);
            if (foundDirRec == undefined) {
                let newDirRec = new JSONDatabase.DirectoryRecord();
                newDirRec.id = treeId;
                newDirRec.name = path.basename(dirPath);
                newDirRec.path = dirPath;
                newDirRec.statistic = new JSONDatabase.Statistic(0, 0, 0);
                if (child.type === JSONDatabase.ENTRYTYPE.FILE) {
                    if (child.status === JSONDatabase.FILESTATUS.ADDED) {
                        newDirRec.statistic.added++;
                    } else if (child.status === JSONDatabase.FILESTATUS.DELETED) {
                        newDirRec.statistic.deleted++;
                    } else if (child.status === JSONDatabase.FILESTATUS.MODIFIED) {
                        newDirRec.statistic.modified++;
                    }
                } else {
                    newDirRec.statistic.added += child.statistic.added;
                    newDirRec.statistic.deleted += child.statistic.deleted;
                    newDirRec.statistic.modified += child.statistic.modified;
                }
                newDirRec.entries.push(child.id);
                child = newDirRec;
            } else {
                if (child.type === JSONDatabase.ENTRYTYPE.FILE) {
                    if (child.status === JSONDatabase.FILESTATUS.ADDED) {
                        foundDirRec.statistic.added++;
                    } else if (child.status === JSONDatabase.FILESTATUS.DELETED) {
                        foundDirRec.statistic.deleted++;
                    } else if (child.status === JSONDatabase.FILESTATUS.MODIFIED) {
                        foundDirRec.statistic.modified++;
                    }
                } else {
                    foundDirRec.statistic.added += child.statistic.added;
                    foundDirRec.statistic.deleted += child.statistic.deleted;
                    foundDirRec.statistic.modified += child.statistic.modified;
                }
                foundDirRec.entries.push(child.id);
                child = foundDirRec;
            }
            dirPath = path.dirname(dirPath);
            return this.createDirectory(commit, dirPath, child);
        });
    }
};

/**
 * Analisa o objeto patch e registra os diretórios e arquivos
 * com o estado de modificação.
 * @param {NodeGit.Commit} commit
 * @param {NodeGit.ConvenientPatch} patch
 * @param {Array<JSONDatabase.DirectoryRecord>} dirs
 */
GitPipe.prototype.parsePatch = function (commit, patch) {
    let child = this.createFile(patch);
    this.db.addFile(child);
    let dirPath = path.dirname(child.path).replace(/^(\.\/)?/, ''); // remove './' from begining.
    return this.createDirectory(commit, dirPath, child);
};

/**
 * Analisa cada objeto diff.
 * @param {NodeGit.Commit} commit - Objeto commit mais recente do diff.
 * @param {NodeGit.Diff} diff - Objeto com os dados do diff.
 */
GitPipe.prototype.parseDiff = function (commit, diff) {
    return diff.patches().then((patches) => {
        let parsePatchPromises = [];
        patches.forEach((patch) => {
            let prom = this.parsePatch(commit, patch);
            parsePatchPromises.push(prom);
        });
        return Promise.all(parsePatchPromises);
    });
};

/**
 * Analisa os diffs salvos temporariamente e insere na base de dados.
 */
GitPipe.prototype.parseDiffs = function () {
    let patchesPromises = [];
    console.assert(this.diffs.length === this.diffRecs.length, 'Error: diffs length is not equal to diffRecs length.');
    for (let i = 0; i < this.diffs.length; i++) {
        let diff = this.diffs[i];
        let diffRec = this.diffRecs[i];
        let prom1 = (function (self, diff, diffRec) {
            let commitId = diffRec.recentCommitId;
            return self.nodegitRepository.getCommit(commitId).then((commit) => {
                return self.parseDiff(commit, diff);
            }).then((dirRec) => {
                let dirId = dirRec.id;
                diffRec.rootDirId = dirId;
                self.db.addDiff(diffRec);
            });
        })(this, diff, diffRec);
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
    let createDiffPromises = [];
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
                    return nodegit.Diff.treeToTree(this.nodegitRepository, parentTree, commitTree);
                }).then((diff) => {
                    this.diffs.push(diff);
                });
            })(parentSnapshotId, commitSnapshotId);
            createDiffPromises.push(prom);
        }
    });
    return Promise.all(createDiffPromises);
};

/**
 * Percorre os commits salvos e salva temporariamente
 * os diffs de cada commit com o commit pai.
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

/**
 * Percorre o histórico e analisa os commits.
 */
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
 * @return {Promise<String>} Promise que retorna o caminho da base de dados.
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
