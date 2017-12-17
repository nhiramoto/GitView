const Git = require('nodegit');
const path = require('path');
const fs = require('fs');
const JSONDatabase = require('./JSONDatabase');

/**
 * Módulo para obtenção dos dados do repositório.
 * @constructor
 * @param {String} dbPath - Caminho do diretório da base de dados.
 */
function GitPipe(dbPath) {
    this.gitRepo = null;
    this.diffs = [];
    if (dbPath == undefined) {
        this.db = null;
    } else {
        this.db = new JSONDatabase(dbPath);
    }
}

/**
 * Abre o repositório usando nodegit e salva na base de dados.
 * @param {String} repositoryPath - Caminho do repositório.
 * @return {Promise<String>} Promise que retorna o caminho da base de dados.
 */
GitPipe.prototype.openRepository = function (repositoryPath) {
    let pathToRepo = path.resolve(repositoryPath);
    let repoRec = null;
    let dbPath = null;
    return Git.Repository.open(pathToRepo).then((repository) => {
        this.gitRepo = repository;
        // Subdiretório onde todas as bases de dados são salvas (uma para cada repositório)
        fs.mkdir('./data', () => {});
        return this.gitRepo.head();
    }).then((head) => {
        let headCommitId = head.target().toString();
        repoRec = new JSONDatabase.RepositoryRecord(this.gitRepo);
        repoRec.head = headCommitId;
        dbPath = './data/' + repoRec.name;
        this.db = new JSONDatabase(dbPath);
        this.db.setRepository(repoRec);
        return dbPath;
    }).catch((err) => {
        if (err) console.log('Error:', err);
    });
};

/**
 * Utiliza o event emitter history para caminhar no histórico de commits.
 * A partir da branch master.
 */
GitPipe.prototype.parseCommitsHistory = function () {
    return this.gitRepo.getHeadCommit().then(commit => {
        let history = commit.history();
        history.on('commit', commit => {
            this.parseCommit(commit);
        });
        history.on('error', err => {
            console.error(err);
        });
        history.on('end', commits => {
            this.db.repository.commitCount = commits.length;
        });
        let retPromise = new Promise(resolve => {
            history.on('end', resolve);
        });
        history.start();
        return retPromise;
    });
};

/**
 * Cria registro do commit.
 * @param {Git.Commit} commit - Commit a ser analisado.
 */
GitPipe.prototype.parseCommit = function (commit) {
    let commitRec = new JSONDatabase.CommitRecord(commit);
    let authorSign = commit.author();
    let authorRec = new JSONDatabase.AuthorRecord(authorSign);
    let authorEmail = authorRec.email;
    commitRec.authorEmail = authorEmail;
    this.db.addCommit(commitRec);
    this.db.addAuthor(authorRec);
};

GitPipe.prototype.registerHeadDiff = function () {
    let repoRec = this.db.getRepository();
    let headId = repoRec.head;
    let commitRec = this.db.findCommit(headId);
    this.diffCommitWithParents(commitRec);
};

/**
 * Cria registro do diff com commits pai.
 * @param {JSONDatabase.CommitRecord} commitRec
 */
GitPipe.prototype.diffCommitWithParents = function (commitRec) {
    let commitId = commitRec.id;
    let commitSnapshotId = commitRec.snapshotId;
    let parentRec = null;
    let parentSnapshotId = null;
    let commitTree = null;
    let parentIds = null;
    return this.gitRepo.getTree(commitSnapshotId).then((tree1) => {
        commitTree = tree1;
        let createDiffPromises = [];
        parentIds = commitRec.parents;
        parentIds.forEach((parentId) => {
            let foundDiff = this.diffs.find((diff) =>
                diff.diffRec.oldCommitId === parentId && diff.diffRec.recentCommitId === commitId);
            if (foundDiff == undefined) {
                parentRec = this.db.findCommit(parentId);
                parentSnapshotId = parentRec.snapshotId;
                diffRec = new JSONDatabase.DiffRecord();
                diffRec.oldCommitId = parentId;
                diffRec.recentCommitId = commitId;
                let prom = (function (self, diffRec, parentSnapshotId, commitTree) {
                    let parentTree;
                    return self.gitRepo.getTree(parentSnapshotId).then((tree2) => {
                        parentTree = tree2;
                        return Git.Diff.treeToTree(self.gitRepo, parentTree, commitTree, Git.Diff.OPTION.INCLUDE_UNMODIFIED);
                    }).then((diff) => {
                        self.diffs.push({
                            gitDiff: diff,
                            diffRec: diffRec
                        });
                    });
                })(this, diffRec, parentSnapshotId, commitTree);
                createDiffPromises.push(prom);
            }
        });
        return Promise.all(createDiffPromises);
    });
};

/**
 * Analisa os diffs salvos temporariamente e insere na base de dados.
 */
GitPipe.prototype.parseDiffs = function () {
    let patchesPromises = [];
    for (let i = 0; i < this.diffs.length; i++) {
        let diff = this.diffs[i];
        let prom1 = (function (self, diff) {
            let gitDiff = diff.gitDiff;
            let commitId = diff.diffRec.recentCommitId;
            return self.gitRepo.getCommit(commitId).then((commit) => {
                return self.parseDiff(commit, gitDiff);
            }).then((dirRec) => {
                //console.log('  parseDiffs(): dirRec:', dirRec);
                let dirId = dirRec.id;
                diff.diffRec.rootDirId = dirId;
                self.db.addDiff(diff.diffRec);
            }).then(() => {
            });
        })(this, diff);
        patchesPromises.push(prom1);
    }
    this.diffs = [];
    return Promise.all(patchesPromises);
};

/**
 * Analisa cada objeto diff.
 * @param {Git.Commit} commit - Objeto commit mais recente do diff.
 * @param {Git.Diff} gitDiff - Objeto com os dados do diff.
 */
GitPipe.prototype.parseDiff = function (commit, gitDiff) {
    return gitDiff.patches().then((patches) => {
        let parsePatchPromises = [];
        patches.forEach((patch) => {
            let prom = this.parsePatch(commit, patch);
            parsePatchPromises.push(prom);
        });
        return Promise.all(parsePatchPromises).then((dirRecs) => {
            let f = dirRecs.filter(d => d.path === '.');
            console.assert(f.length === dirRecs.length, 'GitPipe#parseDiff: Error - Returned directories is not all root.');
            return dirRecs[0];
        });
    });
};

/**
 * Analisa o objeto patch e registra os diretórios e arquivos
 * com o estado da modificação.
 * @param {Git.Commit} commit
 * @param {Git.ConvenientPatch} patch
 * @return {Array<JSONDatabase.DirectoryRecord>}
 */
GitPipe.prototype.parsePatch = function (commit, patch) {
    return this.createFile(patch).then((child) => {
        let dirPath = path.dirname(child.path);
        console.log('creating directories from dirPath:', dirPath);
        return this.createDirectory(commit, dirPath, child);
    });
};

/**
 * Cria registro do arquivo relacionado ao patch.
 * @param  {Git.ConvenientPatch} patch - Objeto patch com as modificações do arquivo.
 * @return {Promise} Um promise que retorna o registro do arquivo criado.
 */
GitPipe.prototype.createFile = function (patch) {
    let newFileId = patch.newFile().id().toString();
    let oldFileId = patch.oldFile().id().toString();
    let diffFileId = oldFileId + ':' + newFileId;
    let foundFileRec = this.db.findFile(diffFileId);
    if (foundFileRec == undefined) {
        let newFilePath = patch.newFile().path();
        console.log('> createFile(path = ' + newFilePath + ')');
        let oldFilePath = patch.oldFile().path();
        console.log('> oldFilePath:', oldFilePath);
        let patchStatus = null;
        if (oldFilePath != newFilePath) {
            patchStatus = JSONDatabase.FILESTATUS.MOVED;
        } else if (patch.isAdded()) {
            patchStatus = JSONDatabase.FILESTATUS.ADDED;
        } else if (patch.isDeleted()) {
            patchStatus = JSONDatabase.FILESTATUS.DELETED;
        } else if (patch.isModified()) {
            patchStatus = JSONDatabase.FILESTATUS.MODIFIED;
        } else if (patch.isUnmodified()) {
            patchStatus = JSONDatabase.FILESTATUS.UNMODIFIED;
        }
        console.assert(patchStatus != null, '[GitPipe#createFile] Error: patchStatus not defined!');
        let statistic = new JSONDatabase.Statistic(0, 0, 0);
        let newFileRec = new JSONDatabase.FileRecord();
        newFileRec.id = diffFileId;
        newFileRec.path = newFilePath;
        newFileRec.name = path.basename(newFilePath);
        newFileRec.oldFileId = oldFileId;
        newFileRec.status = patchStatus;
        newFileRec.statistic = statistic;
        return patch.hunks().then((hunks) => {
            let hunkPromises = [];
            hunks.forEach((hunk) => {
                hunkPromises.push(hunk.lines());
            });
            return Promise.all(hunkPromises);
        }).then((listLines) => {
            listLines.forEach((lines) => {
                lines.forEach((line) => {
                    let oldLineNum = line.oldLineno();
                    let newLineNum = line.newLineno();
                    let lineStatus = null;
                    let sign = String.fromCharCode(line.origin()).trim();
                    if (sign.length > 0) {
                        if (sign === '-') {
                            lineStatus = JSONDatabase.LINESTATUS.DELETED;
                            newFileRec.statistic.deleted++;
                        } else if (sign === '+') {
                            lineStatus = JSONDatabase.LINESTATUS.ADDED;
                            newFileRec.statistic.added++;
                        } else {
                            lineStatus = JSONDatabase.LINESTATUS.UNMODIFIED;
                        }
                    } else {
                        lineStatus = JSONDatabase.LINESTATUS.UNMODIFIED;
                    }
                    let lineRec = new JSONDatabase.LineRecord();
                    lineRec.oldLineNum = oldLineNum;
                    lineRec.newLineNum = newLineNum;
                    lineRec.status = lineStatus;
                    newFileRec.lines.push(lineRec);
                });
            });
            this.db.addFile(newFileRec);
            return newFileRec;
        });
    } else return new Promise((resolve, reject) => resolve(foundFileRec));
};

/**
 * Cria registro de diretórios recursivamente (dos filhos à raiz).
 * @param {Git.Commit} commit - Usado para a recuperação dos objetos tree à partir do seu caminho.
 * @param {String} dirPath - Caminho do diretório a ser criado/atualizado.
 * @param {JSONDatabase.EntryRecord} child - Filho do diretório a ser criado.
 * @return {JSONDatabase.EntryRecord} O último diretório criado (diretório raíz).
 */
GitPipe.prototype.createDirectory = function (commit, dirPath, child) {
    console.log('> createDirectory(path = ' + dirPath + ')');
    if (dirPath.length <= 0) {
        return null;
    } else if (dirPath === '.') {
        return commit.getTree().then((tree) => {
            let treeId = tree.id().toString();
            let foundDirRec = this.db.findDirectory(treeId);
            if (foundDirRec == undefined) { // Diretório ainda não existe
                let newDirRec = new JSONDatabase.DirectoryRecord();
                newDirRec.id = treeId;
                newDirRec.name = '';
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
                this.db.addDirectory(newDirRec);
                child = newDirRec;
            } else { // Diretório já criado, atualiza-o.
                if (foundDirRec.entries.find(e => e.name === child.name) == undefined) { // já existe child?
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
                }
                child = foundDirRec;
            }
            return child;
        });
    } else {
        return commit.getEntry(dirPath).then((entry) => {
            console.assert(entry.isTree(), '[GitPipe#createDirectory] Error: Entry is not a tree.');
            return entry.getTree();
        }).then((tree) => {
            let treeId = tree.id().toString();
            let foundDirRec = this.db.findDirectory(treeId);
            if (foundDirRec == undefined) { // Diretório ainda não existe
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
                this.db.addDirectory(newDirRec);
                child = newDirRec;
            } else { // Diretório já criado, atualiza-o.
                if (foundDirRec.entries.find(e => e.name === child.name) == undefined) { // já existe child?
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
                }
                child = foundDirRec;
            }
            dirPath = path.dirname(dirPath);
            return this.createDirectory(commit, dirPath, child);
        });
    }
};

/**
 * Salva a base de dados em arquivo.
 * @return Sucesso na escrita no arquivo.
 *  ou false caso contrário.
 */
GitPipe.prototype.save = function () {
    if (this.db != null) {
        return this.db.saveToDisk();
    } else {
        console.error('Error: Database not set.');
        return false;
    }
};

/**
 * Carrega a base de dados do arquivo.
 * @return Sucesso na leitura do arquivo.
 */
GitPipe.prototype.load = function () {
    if (this.db != null) {
        return this.db.recoverFromDisk();
    } else {
        console.error('Error: Database not set.');
        return false;
    }
};

GitPipe.prototype.getLastDiffTree = function () {
    if (this.db == null) {
        console.error('[GitPipe#getLastDiffTree] Error: Database not set.');
        return null;
    } else {
        let repoRec = this.db.getRepository();
        if (repoRec == null) {
            console.error('[GitPipe#getLastDiffTree] Error: Repository not opened.');
            return null;
        } else {
            console.log('  repoRec:', repoRec)
            let headId = repoRec.head;
            let commit = this.db.findCommit(headId);
            console.log('  commit:', commit);
            let parentIds = commit.parents;
            let _parentId = parentIds.shift();
            console.log('    -> parentId:', _parentId);
            let diff = this.db.findDiff(_parentId, headId);
            console.log('    -> diff:', diff);
            let rootDirId = diff.rootDirId;
            console.log('    -> rootDirId:', rootDirId);
            let diffDir = this.db.hierarchize(rootDirId);
            console.log('    -> diffDir:', diffDir);
            let rootDir = null;
            parentIds.forEach((parentId) => {
                diff = this.db.findDiff(parentId, headId);
                rootDirId = diff.rootDirId;
                rootDir = this.db.hierarchize(rootDirId);
                console.log('  rootDir:', rootDir);
                diffDir = this.db.mergeDirectories(diffDir, rootDir);
                console.log('  diffDir:', diffDir);
            });
            return diffDir;
        }
    }
};

GitPipe.prototype.setGitRepository = function (gitRepo) {
    this.gitRepo = gitRepo;
};

GitPipe.prototype.getGitRepository = function () {
    return this.gitRepo;
};

GitPipe.prototype.setDb = function (db) {
    this.db = db;
};

GitPipe.prototype.getDb = function () {
    return this.db;
};

module.exports = GitPipe;
