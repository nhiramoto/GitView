'use strict';

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
    return Git.Repository.open(pathToRepo).then(repo => {
        this.gitRepo = repo;
        // Subdiretório onde todas as bases de dados são salvas (uma para cada repositório)
        fs.mkdir('./data', () => {});
        return this.gitRepo.head();
    }).then(head => {
        let headCommitId = head.target().toString();
        repoRec = new JSONDatabase.RepositoryRecord(this.gitRepo);
        repoRec.head = headCommitId;
        dbPath = './data/' + repoRec.name;
        this.db = new JSONDatabase(dbPath);
        this.db.setRepository(repoRec);
        return dbPath;
    }).catch(err => {
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
        let parseCommitsPromises = [];
        history.on('commit', commit => {
            parseCommitsPromises.push(this.parseCommit(commit));
        });
        history.on('error', err => {
            console.error(err);
        });
        let retPromise = new Promise(resolve => {
            history.on('end', commits => {
                this.db.repository.commitCount = commits.length;
                Promise.all(parseCommitsPromises).then(resolve);
            });
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

/**
 * Registra o diff do commit head com seu antecessor.
 */
GitPipe.prototype.registerHeadDiff = function () {
    console.log('> registerHeadDiff');
    let repoRec = this.db.getRepository();
    let headId = repoRec.head;
    let commitRec = this.db.findCommit(headId);
    return this.diffCommitWithParents(commitRec);
};

/**
 * Cria registro do diff com commits pai.
 * @param {JSONDatabase.CommitRecord} commitRec
 */
GitPipe.prototype.diffCommitWithParents = function (commitRec) {
    console.log('> diffCommitWithParents');
    console.log('  commitRec:', commitRec);
    let commitId = commitRec.id;
    console.log('  commitId:', commitId);
    let commitSnapshotId = commitRec.snapshotId;
    console.log('  commitSnapshotId:', commitSnapshotId);
    let commitTree = null;
    let parentRec = null;
    let parentSnapshotId = null;
    let parentIds = null;
    let diffRec = null;
    return this.gitRepo.getTree(commitSnapshotId).then(tree1 => {
        console.log('  commit tree got!');
        commitTree = tree1;
        console.log('  commitTree:', commitTree);
        let createDiffPromises = [];
        parentIds = commitRec.parents;
        console.log('  parentIds...:', parentIds);
        parentIds.forEach(parentId => {
            console.log('    -> parentId:', parentId);
            let foundDiff = this.diffs.find(diff =>
                diff.diffRec.oldCommitId === parentId && diff.diffRec.recentCommitId === commitId);
            console.log('    -> foundDiff:', foundDiff);
            if (foundDiff == undefined) {
                parentRec = this.db.findCommit(parentId);
                console.log('    -> parentRec:', parentRec);
                parentSnapshotId = parentRec.snapshotId;
                diffRec = new JSONDatabase.DiffRecord();
                diffRec.oldCommitId = parentId;
                diffRec.recentCommitId = commitId;
                console.log('    -> creating promise for register diff.');
                let prom = (function (self, diffRec, parentSnapshotId, commitTree) {
                    let parentTree;
                    return self.gitRepo.getTree(parentSnapshotId).then(tree2 => {
                        parentTree = tree2;
                        return Git.Diff.treeToTree(self.gitRepo, parentTree, commitTree, Git.Diff.OPTION.INCLUDE_UNMODIFIED);
                    }).then(gitDiff => {
                        console.log('    -> registering diffRec:', diffRec);
                        self.diffs.push({
                            gitDiff: gitDiff,
                            diffRec: diffRec
                        });
                    });
                })(this, diffRec, parentSnapshotId, commitTree);
                createDiffPromises.push(prom);
            }
        });
        return Promise.all(createDiffPromises);
    }).catch(err => {
        console.error(err);
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
            return self.gitRepo.getCommit(commitId).then(commit => {
                return self.parseDiff(commit, gitDiff);
            }).then(dirRec => {
                //console.log('  parseDiffs(): dirRec:', dirRec);
                if (dirRec != null) {
                    let dirId = dirRec.id;
                    diff.diffRec.rootDirId = dirId;
                    console.log('  adding diff to db:', diff.diffRec);
                    self.db.addDiff(diff.diffRec);
                } else {
                    console.error('[GitPipe#parseDiffs] Error: dirRec is null.');
                }
            }).catch(err => {
                console.error(err);
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
    return gitDiff.patches().then(patches => {
        let parsePatchPromises = [];
        patches.forEach(patch => {
            let prom = this.parsePatch(commit, patch);
            parsePatchPromises.push(prom);
        });
        return Promise.all(parsePatchPromises);
    }).then(dirRecs => {
        let f = dirRecs.filter(d => d.path === '.');
        console.assert(f.length === dirRecs.length, 'GitPipe#parseDiff: Error - Returned directories is not all root.');
        return dirRecs[0];
    }).catch(err => {
        console.error(err);
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
    return this.createFile(patch).then(child => {
        let dirPath = path.dirname(child.path);
        console.log('  creating directories from dirPath:', dirPath);
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
    let foundFile = this.db.findFile(diffFileId);
    let fileRec = null;
    let binaryCheckProm = new Promise(resolve => resolve(null));
    if (foundFile == undefined) {
        let newPath = patch.newFile().path();
        console.log('> createFile(path = ' + newPath + ')');
        let oldPath = patch.oldFile().path();
        console.log('> oldPath:', oldPath);
        let patchStatus = null;
        if (oldPath != newPath) {
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
        fileRec = new JSONDatabase.FileRecord();
        fileRec.id = diffFileId;
        fileRec.path = newPath;
        fileRec.name = path.basename(newPath);
        fileRec.oldFileId = oldFileId;
        fileRec.status = patchStatus;
        fileRec.statistic = statistic;
        binaryCheckProm = this.gitRepo.getBlob(newFileId);
    } else fileRec = foundFile;
    return binaryCheckProm.then(blob => {
        if (blob != null) {
            fileRec.isBinary = blob.isBinary();
        }
        return patch.hunks();
    }).then(hunks => {
        let hunkPromises = [];
        hunks.forEach(hunk => {
            hunkPromises.push(hunk.lines());
        });
        return Promise.all(hunkPromises);
    }).then(listLines => {
        listLines.forEach(lines => {
            lines.forEach(line => {
                let oldLineNum = line.oldLineno();
                let newLineNum = line.newLineno();
                let lineStatus = null;
                let sign = String.fromCharCode(line.origin()).trim();
                if (sign.length > 0) {
                    if (sign === '-') {
                        lineStatus = JSONDatabase.LINESTATUS.DELETED;
                        fileRec.statistic.deleted++;
                    } else if (sign === '+') {
                        lineStatus = JSONDatabase.LINESTATUS.ADDED;
                        fileRec.statistic.added++;
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
                fileRec.lines.push(lineRec);
            });
        });
        if (foundFile == undefined) {
            this.db.addFile(fileRec);
        }
        return fileRec;
    });
};

/**
 * Cria registro de diretórios recursivamente (dos filhos à raiz).
 * @param {Git.Commit} commit - Usado para a recuperação dos objetos tree à partir do seu path.
 * @param {String} dirPath - Caminho do diretório a ser criado/atualizado.
 * @param {JSONDatabase.EntryRecord} child - Filho do diretório a ser criado.
 * @return {JSONDatabase.DirectoryRecord} O último diretório criado (diretório raíz).
 */
GitPipe.prototype.createDirectory = function (commit, dirPath, child) {
    console.log('> createDirectory(path = ' + dirPath + ')');
    if (dirPath.length <= 0) {
        return new Promise(resolve => resolve(null));
    } else {
        let isRoot = dirPath === '.';
        let getTreePromise = null;
        if (isRoot) {
            getTreePromise = commit.getTree();
        } else {
            getTreePromise = commit.getEntry(dirPath).then(entry => {
                console.assert(entry.isTree(), '[GitPipe#createDirectory] Error: Entry is not a tree.');
                return entry.getTree();
            });
        }
        return getTreePromise.then(tree => {
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
                newDirRec.entriesId.push(child.id);
                this.db.addDirectory(newDirRec);
                child = newDirRec;
            } else { // Diretório já existe, atualiza-o.
                let foundEntry = null;
                for (let entryId in foundDirRec.entriesId) {
                    foundEntry = this.db.findEntry(entryId);
                    if (foundEntry != undefined && foundEntry.name === child.name) {
                        break;
                    }
                }
                if (foundEntry == undefined) { // Ainda não existe entry
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
                    foundDirRec.entriesId.push(child.id);
                }
                child = foundDirRec;
            }
            dirPath = path.dirname(dirPath);
            if (isRoot) {
                return child;
            } else {
                return this.createDirectory(commit, dirPath, child);
            }
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

GitPipe.prototype.getHeadDiffTree = function () {
    if (this.db == null) {
        console.error('[GitPipe#getHeadDiffTree] Error: Database not set.');
        return null;
    } else {
        let repoRec = this.db.getRepository();
        if (repoRec == null) {
            console.error('[GitPipe#getHeadDiffTree] Error: Repository not opened.');
            return null;
        } else {
            console.log('  -> repoRec:', repoRec)
            let headId = repoRec.head;
            let commit = this.db.findCommit(headId);
            console.log('  -> head commit:', commit);
            let parentIds = commit.parents;
            let _parentId = parentIds[0];
            console.log('    -> parentId:', _parentId);
            let diff = this.db.findDiff(_parentId, headId);
            console.log('    -> diff:', diff);
            console.assert(diff != null, '[GitPipe#getHeadDiffTree] Error: head commit diff is null.');
            let rootDirId = diff.rootDirId;
            console.log('    -> rootDirId:', rootDirId);
            let diffDir = this.db.hierarchize(rootDirId);
            console.assert(diffDir != null, '[GitPipe#getHeadDiffTree] Error: diffDir is null.');
            console.log('    -> diffDir:', diffDir);
            let rootDir = null;
            parentIds.slice(1).forEach(parentId => {
                console.log('    -> parentId:', parentId);
                diff = this.db.findDiff(parentId, headId);
                console.log('    -> diff:', diff);
                rootDirId = diff.rootDirId;
                console.log('    -> rootDirId:', rootDirId);
                rootDir = this.db.hierarchize(rootDirId);
                console.assert(rootDir != null, '[GitPipe#getHeadDiffTree] Error: rootDir is null.');
                console.log('    -> rootDir:', rootDir);
                diffDir = this.db.mergeDirectories(diffDir, rootDir);
                console.assert(diffDir != null, '[GitPipe#getHeadDiffTree] Error: diffDir is null.');
                console.log('    -> diffDir:', diffDir);
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
