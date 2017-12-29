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
    this.selectedCommit = null;
    this.diffs = [];
    if (dbPath == undefined) {
        this.db = null;
    } else {
        this.db = new JSONDatabase(dbPath);
    }
    this.diffOptions = new Git.DiffOptions();
    this.diffOptions.flags = Git.Diff.OPTION.INCLUDE_UNMODIFIED;
}

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

GitPipe.prototype.setSelectedCommit = function (selectedCommit) {
    this.selectedCommit = selectedCommit;
};

GitPipe.prototype.getSelectedCommit = function () {
    return this.selectedCommit;
};

/**
 * Abre o repositório e salva na base de dados.
 * @param {String} repoPath Caminho do repositório.
 * @return {Promise<String>} Promise que retorna o caminho da base de dados.
 */
GitPipe.prototype.openRepository = function (repoPath) {
    let pathToRepo = path.resolve(repoPath);
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
        if (err) console.error('Error:', err);
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
GitPipe.prototype.registerHeadCommitDiff = function () {
    let repoRec = this.db.getRepository();
    let headId = repoRec.head;
    let commitRec = this.db.findCommit(headId);
    this.selectedCommit = commitRec;
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
                foundDiff = this.db.findDiff(diff =>
                    diff.diffRec.oldCommitId === parentId && diff.diffRec.recentCommitId === commitId);
            }
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
            let recentCommitId = diff.diffRec.recentCommitId;
            let oldCommitId = diff.diffRec.oldCommitId;
            let recentCommit = null;
            let oldCommit = null;
            return self.gitRepo.getCommit(recentCommitId).then(c1 => {
                recentCommit = c1;
                return self.gitRepo.getCommit(oldCommitId);
            }).then(c2 => {
                oldCommit = c2;
                return self.parseDiff(oldCommit, recentCommit, gitDiff);
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
 * @param {Git.Commit} oldCommit - Objeto commit mais antigo do diff.
 * @param {Git.Commit} recentCommit - Objeto commit mais recente do diff.
 * @param {Git.Diff} gitDiff - Objeto com os dados do diff.
 */
GitPipe.prototype.parseDiff = function (oldCommit, recentCommit, gitDiff) {
    return gitDiff.patches().then(patches => {
        return this.parsePatches(oldCommit, recentCommit, patches);
    }).catch(err => {
        console.error(err);
    });
};

/**
 * Chama parsePatch syncronamente entre os elementos de patch.
 * @param {Git.Commit} oldCommit Commit mais antigo do diff.
 * @param {Git.Commit} recentCommit Commit mais recent do diff.
 * @param {Array<Git.Patch>} patches Lista de patches a serem analisados.
 * @return {Promise<JSONDatabase.DirectoryRecord} Retorna o registro do
 *   diretório raíz.
 */
GitPipe.prototype.parsePatches = function (oldCommit, recentCommit, patches) {
    let patch = patches.shift();
    return this.parsePatch(oldCommit, recentCommit, patch).then(dirRec => {
        if (patches.length <= 0) {
            return dirRec;
        } else {
            return this.parsePatches(oldCommit, recentCommit, patches);
        }
    });
};

/**
 * Analisa o objeto patch e registra os diretórios e arquivos
 * com o estado da modificação.
 * @param {Git.Commit} oldCommit Commit mais antigo do diff.
 * @param {Git.Commit} recentCommit Commit mais recent do diff.
 * @param {Git.ConvenientPatch} patch Patch a ser analisado.
 * @return {Array<JSONDatabase.DirectoryRecord>} Retorna o registro do
 *   diretório raíz criado.
 */
GitPipe.prototype.parsePatch = function (oldCommit, recentCommit, patch) {
    return this.createFile(patch).then(child => {
        let dirPath = path.dirname(child.path);
        return this.createDirectory(oldCommit, recentCommit, dirPath, child, new JSONDatabase.Statistic(0, 0, 0));
    });
};

/**
 * Cria registro do arquivo relacionado ao patch e adiciona à base de dados.
 * @param  {Git.ConvenientPatch} patch - Objeto patch com as modificações do arquivo.
 * @return {Promise} Retorna o registro do arquivo criado.
 */
GitPipe.prototype.createFile = function (patch) {
    let newFileId = patch.newFile().id().toString();
    let oldFileId = patch.oldFile().id().toString();
    if (oldFileId == 0) {
        oldFileId = '0';
    }
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

/**
 * Analisa e cria o registro das linhas do patch relacionado.
 * @param {JSONDatabase.FileRecord} fileRec Arquivo onde as linhas criadas serão associadas.
 * @param {Array<Git.DiffLine>} lines Conjunto das linhas.
 */
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
 * Cria registro dos diretórios recursivamente (dos filhos à raiz).
 * @param {Git.Commit} oldCommit - Recupera objetos tree mais antigos pelo path
 * @param {Git.Commit} recentCommit - Recupera objetos tree mais recentes pelo path
 * @param {String} dirPath - Caminho do diretório a ser criado/atualizado.
 * @param {JSONDatabase.EntryRecord} child - Filho do diretório a ser criado.
 * @param {JSONDatabase.Statistic} carryStat Utilizado para atualizar estatísticas dos diretórios já existentes.
 * @return {JSONDatabase.DirectoryRecord} O último diretório criado (diretório raíz).
 */
GitPipe.prototype.createDirectory = function (oldCommit, recentCommit, dirPath, child, carryStat) {
    if (dirPath.length <= 0) {
        //console.log('[GitPipe#createDirectory] Invalid dirPath, ignoring directory: "' + dirPath + '"');
        return new Promise(resolve => resolve(null));
    } else {
        //console.log('> createDirectory(path = ' + dirPath + ')');
        //console.log('  child:', child);
        let isRoot = dirPath === '.';
        let getOldTreePromise = null;
        let getNewTreePromise = null;
        let oldTree = null;
        let newTree = null;
        if (isRoot) {
            getOldTreePromise = oldCommit.getTree();
            getNewTreePromise = recentCommit.getTree();
        } else {
            getOldTreePromise = oldCommit.getEntry(dirPath).then(e1 => {
                console.assert(e1.isTree(), '[GitPipe#createDirectory] Error: Entry is not a tree.');
                return e1.getTree();
            });
            getNewTreePromise = recentCommit.getEntry(dirPath).then(e2 => {
                console.assert(e2.isTree(), '[GitPipe#createDirectory] Error: Entry is not a tree.');
                return e2.getTree();
            });
        }
        return getOldTreePromise.then(t1 => {
            oldTree = t1;
            return getNewTreePromise;
        }).then(t2 => {
            newTree = t2;
            let oldTreeId = oldTree.id().toString();
            let newTreeId = newTree.id().toString();
            let newId = oldTreeId + ':' + newTreeId;
            let foundDirRec = this.db.findDirectory(newId);
            if (foundDirRec == undefined) { // Diretório ainda não existe
                //console.log('    Directory ' + dirPath + ' doesnt exists yet. Creating a new one.');
                let newDirRec = new JSONDatabase.DirectoryRecord();
                newDirRec.id = newId;
                newDirRec.name = isRoot ? '' : path.basename(dirPath);
                newDirRec.path = dirPath;
                newDirRec.statistic = new JSONDatabase.Statistic(0, 0, 0);
                if (child.isFile()) {
                    if (child.isAdded()) {
                        newDirRec.statistic.added++;
                    } else if (child.isDeleted()) {
                        newDirRec.statistic.deleted++;
                    } else if (child.isModified()) {
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
                // --- By id ---
                let foundEntryId = foundDirRec.entriesId.find(eid => (eid === child.id));
                // --- By name ---
                //let foundEntry = null;
                //for (let i = 0; i < foundDirRec.entriesId.length; i++) {
                //    let entryId = foundDirRec.entriesId[i];
                //    //console.log('      -> entryId:', entryId);
                //    foundEntry = this.db.findEntry(entryId);
                //    console.assert(foundEntry != null, '[GitPipe#createDirectory] Error: Entry not found, loose id.');
                //    if (foundEntry.name === child.name) {
                //        break;
                //    } else {
                //        foundEntry = null;
                //    }
                //}
                //console.log('      -> foundEntry:', foundEntry);
                if (foundEntryId == undefined) { // Ainda não existe entry
                    if (child.isFile()) {
                        if (child.isAdded()) {
                            carryStat.added++;
                        } else if (child.isDeleted()) {
                            carryStat.deleted++;
                        } else if (child.isModified()) {
                            carryStat.modified++;
                        }
                    } else {
                        //console.log(foundDirRec.path + ' statistic:', foundDirRec.statistic);
                        carryStat.added += child.statistic.added;
                        carryStat.deleted += child.statistic.deleted;
                        carryStat.modified += child.statistic.modified;
                    }
                    //console.log('      Entry' + child.path + ' doesnt exists yet, adding to found dir ' + dirPath);
                    foundDirRec.entriesId.push(child.id);
                }
                foundDirRec.statistic.added += carryStat.added;
                foundDirRec.statistic.deleted += carryStat.deleted;
                foundDirRec.statistic.modified += carryStat.modified;
                child = foundDirRec;
            }
            dirPath = path.dirname(dirPath);
            if (isRoot) {
                return child;
            } else {
                return this.createDirectory(oldCommit, recentCommit, dirPath, child, carryStat);
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
            let headId = repoRec.head;
            let commit = this.db.findCommit(headId);
            console.log('  -> head commit:', commit);
            let parentIds = commit.parents;
            let diff = null;
            let diffDir = null;
            let rootDirId = null;
            let rootDir = null;
            let count = 0;
            parentIds.forEach(parentId => {
                //console.log('    -> parentId:', parentId);
                diff = this.db.findDiff(parentId, headId);
                //console.log('    -> diff:', diff);
                if (diff != undefined) {
                    rootDirId = diff.rootDirId;
                    //console.log('    -> rootDirId:', rootDirId);
                    let ids = rootDirId.split(':');
                    if (ids[0] !== ids[1]) {
                        count++;
                        if (diffDir != null) {
                            rootDir = this.db.hierarchize(rootDirId);
                            console.assert(rootDir != null, '[GitPipe#getHeadDiffTree] Error: rootDir is null.');
                            //console.log('    -> rootDir:', rootDir);
                            diffDir = this.db.mergeDirectories(diffDir, rootDir);
                            console.assert(diffDir != null, '[GitPipe#getHeadDiffTree] Error: diffDir is null.');
                            //console.log('    -> diffDir:', diffDir);
                        } else {
                            diffDir = this.db.hierarchize(rootDirId);
                            console.assert(diffDir != null, '[GitPipe#getHeadDiffTree] Error: diffDir is null.');
                        }
                    } else {
                        console.log('Unmodified patches, ignoring.');
                    }
                }
            });
            console.log('-> Merged ' + count + ' directories!');
            if (diffDir == null) {
                console.log('There is no changes.');
                diff = this.db.findDiff(parentIds[0], headId);
                if (diff != undefined) {
                    rootDirId = diff.rootDirId;
                    diffDir = this.db.hierarchize(rootDirId);
                    console.assert(diffDir != null, '[GitPipe#getHeadDiffTree] Error: diffDir is null.');
                }
            }
            return diffDir;
        }
    }
};

GitPipe.prototype.selectCommit = function (commitId) {
    let selectedCommitId = this.selectedCommit.id;
    if (selectedCommitId != commitId) {
        this.selectedCommit = this.db.findCommit(commitId);
        return this.selectedCommit != undefined;
    } else {
        return false;
    }
};

GitPipe.prototype.registerSelectedCommitDiff = function () {
    return diffCommitWithParents(this.selectedCommit);
};

GitPipe.prototype.getSelectedCommitDiffTree = function () {
    if (this.db == null) {
        console.error('[GitPipe#getSelectedCommitDiffTree] Error: Database not set.');
        return null;
    } else {
        let repoRec = this.db.getRepository();
        if (repoRec == null) {
            console.error('[GitPipe#getSelectedCommitDiffTree] Error: Repository not opened.');
            return null;
        } else {
            let parentIds = this.selectedCommit.parents;
            let selectedCommitId = this.selectedCommit.id;
            let diff = null;
            let rootDirId = null;
            let rootDir = null;
            let count = 0;
            parentIds.forEach(parentId => {
                diff = this.db.findDiff(parentId, selectedCommitId);
                if (diff != undefined) {
                    rootDirId = diff.rootDirId;
                    let ids = rootDirId.split(':');
                    if (ids[0] !== ids[1]) {
                        count++;
                        if (diffDir != null) {
                            rootDir = this.db.hierarchize(rootDirId);
                            console.assert(rootDir != null, '[GitPipe#getSelectedCommitDiffTree] Error: rootDir is null.');
                            diffDir = this.db.mergeDirectories(diffDir, rootDir);
                            console.assert(diffDir != null, '[GitPipe#getSelectedCommitDiffTree] Error: diffDir is null.');
                        } else {
                            diffDir = this.db.hierarchize(rootDirId);
                            console.assert(diffDir != null, '[GitPipe#getSelectedCommitDiffTreel] Error: diffDir is null.');
                        }
                    } else {
                        console.log('Unmodified patches, ignoring.');
                    }
                }
            });
            console.log('-> Merged ' + count + ' directories!');
            if (diffDir == null) {
                console.log('There is no changes.');
                diff = this.db.findDiff(parentIds[0], selectedCommitId);
                if (diff != undefined) {
                    rootDirId = diff.rootDirId;
                    diffDir = this.db.hierarchize(rootDirId);
                    console.assert(diffDir != null, '[GitPipe#getHeadDiffTree] Error: diffDir is null.');
                }
            }
            return diffDir;
        }
    }
};

module.exports = GitPipe;
