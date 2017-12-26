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
    this.diffOptions = new Git.DiffOptions();
    this.diffOptions.flags = Git.Diff.OPTION.INCLUDE_UNMODIFIED;
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
    let commitId = commitRec.id;
    let commitSnapshotId = commitRec.snapshotId;
    let commitTree = null;
    let parentRec = null;
    let parentSnapshotId = null;
    let parentIds = null;
    let diffRec = null;
    return this.gitRepo.getTree(commitSnapshotId).then(tree1 => {
        commitTree = tree1;
        let createDiffPromises = [];
        parentIds = commitRec.parents;
        parentIds.forEach(parentId => {
            let foundDiff = this.diffs.find(diff =>
                diff.diffRec.oldCommitId === parentId && diff.diffRec.recentCommitId === commitId);
            if (foundDiff == undefined) {
                parentRec = this.db.findCommit(parentId);
                parentSnapshotId = parentRec.snapshotId;
                diffRec = new JSONDatabase.DiffRecord();
                diffRec.oldCommitId = parentId;
                diffRec.recentCommitId = commitId;
                let prom = (function (self, diffRec, parentSnapshotId, commitTree) {
                    let parentTree;
                    return self.gitRepo.getTree(parentSnapshotId).then(tree2 => {
                        parentTree = tree2;
                        return Git.Diff.treeToTree(self.gitRepo, parentTree, commitTree, self.diffOptions);
                    }).then(gitDiff => {
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
        let oldPath = patch.oldFile().path();
        let patchStatus = null;
        if (oldPath != newPath) {
            patchStatus = JSONDatabase.STATUS.MOVED;
        } else if (patch.isAdded()) {
            patchStatus = JSONDatabase.STATUS.ADDED;
        } else if (patch.isDeleted()) {
            patchStatus = JSONDatabase.STATUS.DELETED;
        } else if (patch.isModified()) {
            patchStatus = JSONDatabase.STATUS.MODIFIED;
        } else if (patch.isUnmodified()) {
            patchStatus = JSONDatabase.STATUS.UNMODIFIED;
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
            this.parseLines(fileRec, lines);
        });
        if (foundFile == undefined) {
            this.db.addFile(fileRec);
        }
        return fileRec;
    });
};

GitPipe.prototype.parseLines = function(fileRec, lines) {
    //console.log('> parseLines');
    let addedLines = [];
    let deletedLines = [];
    let lastLine = null;
    let lastCtxLine = null;
    let lastIsAdded = false;
    let lastIsDeleted = false;
    let modStatus = 0;
    //console.log('  lines length:', lines.length);
    lines.forEach(line => {
        let oldLineNum = line.oldLineno();
        let newLineNum = line.newLineno();
        let content = line.content();
        let lineRec = new JSONDatabase.LineRecord();
        lineRec.content = content;
        let sign = String.fromCharCode(line.origin()).trim();
        //console.log('sign: "' + sign + '"');
        //console.log(sign, content, '{ oldLineNum:' + oldLineNum + ',newLineNum:' + newLineNum + ' }');
        if (sign.length > 0) {
            if (sign === '+') {
                if (!lastIsAdded && !lastIsDeleted
                        && (lastLine == null
                            || newLineNum === lastLine.newLineno() + 1)) {
                    modStatus++;
                    //console.log('  first line after context -> modStatus:' + modStatus);
                } else if (lastIsAdded && lastLine != null
                    && newLineNum !== lastLine.newLineno() + 1
                    || lastIsDeleted) {
                    //console.log('  line origin changed.');
                    if (modStatus === 2) {
                        fileRec.addBlock(deletedLines, addedLines, JSONDatabase.STATUS.MODIFIED);
                        addedLines = [];
                        deletedLines = [];
                        modStatus = 0;
                    }
                    if (lastCtxLine == null || newLineNum === lastCtxLine.newLineno() + 1) {
                        modStatus++;
                        //console.log('  modification detected -> modStatus:' + modStatus);
                    } else if (modStatus === 1) {
                        if (lastIsAdded) {
                            fileRec.addBlock(null, addedLines, JSONDatabase.STATUS.ADDED);
                        } else {
                            console.assert(lastIsDeleted, '[GitPipe#parseLines] Error: Last line is not added or deleted.');
                            fileRec.addBlock(deletedLines, null, JSONDatabase.STATUS.DELETED);
                        }
                        addedLines = [];
                        deletedLines = [];
                        modStatus = 0;
                    }
                }
                lineRec.lineNum = newLineNum;
                addedLines.push(lineRec);
                lastIsAdded = true;
                lastIsDeleted = false;
                //console.log(sign, 'modStatus:' + modStatus, 'lastisAdded:' + lastIsAdded, 'lastIsDeleted:' + lastIsDeleted);
            } else if (sign === '-') {
                if (!lastIsAdded && !lastIsDeleted
                        && lastLine != null
                        && oldLineNum === lastLine.oldLineno() + 1) {
                    modStatus++;
                    //console.log('  first line after context -> modStatus:' + modStatus);
                } else if (lastIsDeleted && lastLine != null
                    && oldLineNum !== lastLine.oldLineno() + 1
                    || lastIsAdded) {
                    //console.log('  line origin changed.');
                    if (modStatus === 2) {
                        fileRec.addBlock(deletedLines, addedLines, JSONDatabase.STATUS.MODIFIED);
                        addedLines = [];
                        deletedLines = [];
                        modStatus = 0;
                    }
                    if (lastCtxLine == null || newLineNum === lastCtxLine.newLineno() + 1) {
                        modStatus++;
                        //console.log('  modification detected -> modStatus:' + modStatus);
                    } else if (modStatus === 1) {
                        if (lastIsAdded) {
                            fileRec.addBlock(null, addedLines, JSONDatabase.STATUS.ADDED);
                        } else {
                            console.assert(lastIsDeleted, '[GitPipe#parseLines] Error: Last line is not added or deleted.');
                            fileRec.addBlock(deletedLines, null, JSONDatabase.STATUS.DELETED);
                        }
                        addedLines = [];
                        deletedLines = [];
                        modStatus = 0;
                    }
                }
                lineRec.lineNum = oldLineNum;
                deletedLines.push(lineRec);
                lastIsAdded = false;
                lastIsDeleted = true;
                //console.log(sign, 'modStatus:' + modStatus, 'lastisAdded:' + lastIsAdded, 'lastIsDeleted:' + lastIsDeleted);
            }
        } else { // context line
            if (modStatus === 2) {
                fileRec.addBlock(deletedLines, addedLines, JSONDatabase.STATUS.MODIFIED);
                addedLines = [];
                deletedLines = [];
                modStatus = 0;
            } else if (modStatus === 1) {
                if (lastIsAdded) {
                    fileRec.addBlock(null, addedLines, JSONDatabase.STATUS.ADDED);
                } else {
                    console.assert(lastIsDeleted, '[GitPipe#parseLines] Error: Last line is not added or deleted.');
                    fileRec.addBlock(deletedLines, null, JSONDatabase.STATUS.DELETED);
                }
                addedLines = [];
                deletedLines = [];
                modStatus = 0;
            }
            lastCtxLine = line;
            lastIsAdded = false;
            lastIsDeleted = false;
            //console.log('  lastCtxLine:' + lastCtxLine, 'modStatus:' + modStatus, 'lastisAdded:' + lastIsAdded, 'lastIsDeleted:' + lastIsDeleted);
        }
        lastLine = line;
    });
    // Check for modification at end of the file
    if (modStatus === 2) {
        fileRec.addBlock(deletedLines, addedLines, JSONDatabase.STATUS.MODIFIED);
        addedLines = [];
        deletedLines = [];
        modStatus = 0;
    } else if (modStatus === 1) {
        if (lastIsAdded) {
            fileRec.addBlock(null, addedLines, JSONDatabase.STATUS.ADDED);
        } else {
            console.assert(lastIsDeleted, '[GitPipe#parseLines] Error: Last line is not added or deleted.');
            fileRec.addBlock(deletedLines, null, JSONDatabase.STATUS.DELETED);
        }
        addedLines = [];
        deletedLines = [];
        modStatus = 0;
    }
};

/**
 * Cria registro de diretórios recursivamente (dos filhos à raiz).
 * @param {Git.Commit} commit - Usado para a recuperação dos objetos tree à partir do seu path.
 * @param {String} dirPath - Caminho do diretório a ser criado/atualizado.
 * @param {JSONDatabase.EntryRecord} child - Filho do diretório a ser criado.
 * @return {JSONDatabase.DirectoryRecord} O último diretório criado (diretório raíz).
 */
GitPipe.prototype.createDirectory = function (commit, dirPath, child) {
    if (dirPath.length <= 0) {
        //console.log('[GitPipe#createDirectory] Invalid dirPath, ignoring directory: "' + dirPath + '"');
        return new Promise(resolve => resolve(null));
    } else {
        //console.log('> createDirectory(path = ' + dirPath + ')');
        //console.log('  child:', child);
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
                //console.log('    Directory ' + dirPath + ' doesnt exists yet. Creating a new one.');
                let newDirRec = new JSONDatabase.DirectoryRecord();
                newDirRec.id = treeId;
                newDirRec.name = isRoot ? '' : path.basename(dirPath);
                newDirRec.path = dirPath;
                newDirRec.statistic = new JSONDatabase.Statistic(0, 0, 0);
                if (child.type === JSONDatabase.ENTRYTYPE.FILE) {
                    if (child.status === JSONDatabase.STATUS.ADDED) {
                        newDirRec.statistic.added++;
                    } else if (child.status === JSONDatabase.STATUS.DELETED) {
                        newDirRec.statistic.deleted++;
                    } else if (child.status === JSONDatabase.STATUS.MODIFIED) {
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
                //console.log('    Directory found ' + dirPath + ' entriesId: ' + foundDirRec.entriesId);
                let foundEntry = null;
                for (let i = 0; i < foundDirRec.entriesId.length; i++) {
                    let entryId = foundDirRec.entriesId[i];
                    //console.log('      -> entryId:', entryId);
                    foundEntry = this.db.findEntry(entryId);
                    console.assert(foundEntry != null, '[GitPipe#createDirectory] Error: Entry not found, loose id.');
                    if (foundEntry.name === child.name) {
                        break;
                    } else {
                        foundEntry = null;
                    }
                }
                //console.log('      -> foundEntry:', foundEntry);
                if (foundEntry == null) { // Ainda não existe entry
                    if (child.isFile()) {
                        if (child.status === JSONDatabase.STATUS.ADDED) {
                            foundDirRec.statistic.added++;
                        } else if (child.status === JSONDatabase.STATUS.DELETED) {
                            foundDirRec.statistic.deleted++;
                        } else if (child.status === JSONDatabase.STATUS.MODIFIED) {
                            foundDirRec.statistic.modified++;
                        }
                    } else {
                        foundDirRec.statistic.added += child.statistic.added;
                        foundDirRec.statistic.deleted += child.statistic.deleted;
                        foundDirRec.statistic.modified += child.statistic.modified;
                    }
                    //console.log('      Entry' + child.path + ' doesnt exists yet, adding to found dir ' + dirPath);
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
            //console.log('  -> repoRec:', repoRec)
            let headId = repoRec.head;
            let commit = this.db.findCommit(headId);
            //console.log('  -> head commit:', commit);
            let parentIds = commit.parents;
            let _parentId = parentIds[0];
            //console.log('    -> parentId:', _parentId);
            let diff = this.db.findDiff(_parentId, headId);
            //console.log('    -> diff:', diff);
            console.assert(diff != null, '[GitPipe#getHeadDiffTree] Error: head commit diff is null.');
            let rootDirId = diff.rootDirId;
            //console.log('    -> rootDirId:', rootDirId);
            let diffDir = this.db.hierarchize(rootDirId);
            console.assert(diffDir != null, '[GitPipe#getHeadDiffTree] Error: diffDir is null.');
            //console.log('    -> diffDir:', diffDir);
            let rootDir = null;
            parentIds.slice(1).forEach(parentId => {
                //console.log('    -> parentId:', parentId);
                diff = this.db.findDiff(parentId, headId);
                //console.log('    -> diff:', diff);
                // diff == null -> There is no changes.
                if (diff != null) {
                    rootDirId = diff.rootDirId;
                    //console.log('    -> rootDirId:', rootDirId);
                    rootDir = this.db.hierarchize(rootDirId);
                    console.assert(rootDir != null, '[GitPipe#getHeadDiffTree] Error: rootDir is null.');
                    //console.log('    -> rootDir:', rootDir);
                    diffDir = this.db.mergeDirectories(diffDir, rootDir);
                    console.assert(diffDir != null, '[GitPipe#getHeadDiffTree] Error: diffDir is null.');
                    //console.log('    -> diffDir:', diffDir);
                }
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
