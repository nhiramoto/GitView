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
    while (filePath.length > 0) {
        let name = path.basename(filePath);
        let prom = commit.getEntry(name).then((entry) => {
            console.assert(entry.isTree(), 'GitPipe#createDiffDirectories: entry is not a tree.');
            return entry.getTree();
        }).then((tree) => {
            let treeId = tree.id().toString();
            let foundDir = this.db.findDirectory(treeId);
            if (foundDir == undefined) {

            } else {
            }
        });
    }
};

GitPipe.prototype.parseDiffs = function () {
    let patchesPromises = [];
    for (let i = 0; i < this.diffs.length; i++) {
        let diff = this.diffs[i];
        let prom1 = diff.patches().then((patches) => {
            let patchPromises = [];
            patches.forEach((patch) => {
                let prom2 = this.parsePatch(patch);
                if (prom2 != null) {
                    patchPromises.push(prom2);
                }
            });
            return Promise.all(patchPromises);
        }).then((fileRecs) => {
            fileRecs.forEach((fileRec) => {
                let diffFilePath = fileRec.path;
                let diffRec = this.diffRecs[i];
                let commit = this.repository.getCommit(diffRec.recentCommitId);
                let rootDirId = createDiffDirectories(filePath, commit);
                diffRec.rootDirId = rootDirId;
                this.db.addDiff(diffRec);
            });
        });
        patchesPromises.push(prom1);
    }
    return Promise.all(patchesPromises);
};

GitPipe.prototype.diffCommitWithParents = function (commit) {
    let commitId = commit.sha();
    let commitTree = null;
    let parentId = null;
    let parentTree = null;
    let diffRec = null;
    return commit.getTree().then((tree1) => {
        commitTree = tree1;
        return commit.getParents();
    }).then((parents) => {
        let parentsPromises = [];
        parents.forEach((parent) => {
            parentId = parent.sha();
            diffRec = new JSONDatabase.DiffRecord();
            diffRec.oldCommitId = parentId;
            diffRec.recentCommitId = commitId;
            this.diffRecs.push(diffRec);
            let prom = parent.getTree().then((tree2) => {
                parentTree = tree2;
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
            if (reference.isBranch()) {
                let commitId = reference.target();
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
        this.repository = repository;
        // Subdiretório onde todas as bases de dados são salvas (uma para cada repositório)
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
