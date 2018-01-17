'use strict';

const Git = require('nodegit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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
    this.diffOptions.flags = Git.Diff.OPTION.INCLUDE_UNMODIFIED
        + Git.Diff.OPTION.IGNORE_SUBMODULES
        + Git.Diff.OPTION.IGNORE_FILEMODE
        + Git.Diff.OPTION.INCLUDE_UNTRACKED
        ;
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

GitPipe.prototype.findAuthor = function (authorEmail) {
    return this.db.findAuthor(authorEmail);
};

/**
 * Abre o repositório e salva na base de dados.
 * @async
 * @param {String} repoPath Caminho do repositório.
 * @return {Promise<String>} Caminho da base de dados.
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
        let sha1gen = crypto.createHash('sha1');
        sha1gen.update(repoRec.path);
        let repoFileName = sha1gen.digest('hex');
        dbPath = './data/' + repoFileName;
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
 * @async
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
    }).catch(err => {
        console.error(err);
    });
};

/**
 * Cria registro do commit.
 * @sync
 * @param {Git.Commit} commit Commit a ser analisado.
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
 * @async
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
 * @async
 * @param {JSONDatabase.CommitRecord} commitRec Commit a partir
 *   do qual será criado o diff.
 */
GitPipe.prototype.diffCommitWithParents = function (commitRec) {
    let commitId = commitRec.id;
    let commitSnapshotId = commitRec.snapshotId;
    let commitTree = null;
    let commit = null;
    let parentRec = null;
    let parentSnapshotId = null;
    let parentIds = commitRec.parents;
    let diffRec = null;
    //if (parentIds.length > 0) {
        return this.gitRepo.getTree(commitSnapshotId).then(tree1 => {
            commitTree = tree1;
            let createDiffPromises = [];
            if (parentIds != null && parentIds.length > 0) {
                parentIds.forEach(parentId => {
                    let foundDiff = this.diffs.find(diff =>
                        diff.diffRec.oldCommitId === parentId && diff.diffRec.recentCommitId === commitId);
                    if (foundDiff == undefined) {
                        foundDiff = this.db.findDiff(parentId, commitId);
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
            } else { // First commit
                let foundDiff = this.diffs.find(diff =>
                    diff.diffRec.oldCommitId == null && diff.diffRec.recentCommitId === commitId);
                if (foundDiff == undefined) {
                    foundDiff = this.db.findDiff(null, commitId);
                }
                if (foundDiff == undefined) {
                    diffRec = new JSONDatabase.DiffRecord();
                    diffRec.oldCommitId = null;
                    diffRec.recentCommitId = commitId;
                    let prom = (function(self, diffRec, commitTree) {
                        return Git.Diff.treeToTree(self.gitRepo, null, commitTree, self.diffOptions).then(gitDiff => {
                            self.diffs.push({
                                gitDiff: gitDiff,
                                diffRec: diffRec
                            });
                        });
                    })(this, diffRec, commitTree);
                    createDiffPromises.push(prom);
                }
            }
            return Promise.all(createDiffPromises);
        }).catch(err => {
            console.error(err);
        });
    //} else {
    //    return this.gitRepo.getCommit(commitId).then(commit => {
    //        return commit.getDiffWithOptions(this.diffOptions)
    //    }).then(diffs => {
    //        console.assert(diffs.length === 1, '[GitPipe#diffCommitWithParents] Error: Unexpected number of diffs on first commit.');
    //        diffRec = new JSONDatabase.DiffRecord();
    //        diffRec.oldCommitId = null;
    //        diffRec.recentCommitId = commitId;
    //        this.diffs.push({
    //            gitDiff: diffs[0],
    //            diffRec: diffRec
    //        });
    //    }).catch(err => {
    //        console.error(err);
    //    });
    //}
};

/**
 * Analisa os diffs salvos temporariamente e insere na base de dados.
 * @async
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
                if (oldCommitId != null) {
                    return self.gitRepo.getCommit(oldCommitId);
                } else {
                    return new Promise(resolve => resolve(null));
                }
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
 * @async
 * @param {Git.Commit} oldCommit - Objeto commit mais antigo do diff.
 * @param {Git.Commit} recentCommit - Objeto commit mais recente do diff.
 * @param {Git.Diff} gitDiff - Objeto com os dados do diff.
 */
GitPipe.prototype.parseDiff = function (oldCommit, recentCommit, gitDiff) {
    return gitDiff.patches().then(patches => {
        console.log('patches:', patches);
        return this.parsePatches(oldCommit, recentCommit, patches);
    }).catch(err => {
        console.error(err);
    });
};

/**
 * Chama parsePatch syncronamente entre os elementos de patch.
 * @async
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
    }).catch(err => {
        console.error(err);
    });
};

/**
 * Analisa o objeto patch e registra os diretórios e arquivos
 * com o estado da modificação.
 * @async
 * @param {Git.Commit} oldCommit Commit mais antigo do diff.
 * @param {Git.Commit} recentCommit Commit mais recent do diff.
 * @param {Git.ConvenientPatch} patch Patch a ser analisado.
 * @return {Array<JSONDatabase.DirectoryRecord>} Retorna o registro do
 *   diretório raíz criado.
 */
GitPipe.prototype.parsePatch = function (oldCommit, recentCommit, patch) {
    return this.createFile(oldCommit, recentCommit, patch).then(child => {
        console.log('file changed:', child.path);
        return this.createDirectories(oldCommit, recentCommit, child, new JSONDatabase.Statistic(0, 0, 0), false);
    }).catch(err => {
        console.error(err);
    });
};

/**
 * Cria registro do arquivo relacionado ao patch e adiciona à base de dados.
 * @async
 * @param {Git.Commit} oldCommit Commit mais antigo do diff.
 * @param {Git.Commit} recentCommit Commit mais recente do diff.
 * @param  {Git.ConvenientPatch} patch - Objeto patch com as modificações do arquivo.
 * @return {Promise} Retorna o registro do arquivo criado.
 */
GitPipe.prototype.createFile = function (oldCommit, recentCommit, patch) {
    //console.log('> createFile()');
    let oldFileId = patch.oldFile().id().toString();
    let newFileId = patch.newFile().id().toString();
    let oldId = oldFileId != 0 ? oldFileId : '0';
    let newId = newFileId != 0 ? newFileId : '0';
    if (oldId == 0 && newId == 0) {
        console.error('[GitPipe#createFile] Error: Null old and new file ID. Path:', patch.newFile().path());
    }
    let diffFileId = oldFileId + ':' + newFileId;
    //console.log('  diffFileId:', diffFileId);
    let foundFileRec = this.db.findFile(diffFileId);
    if (foundFileRec == undefined) {
        foundFileRec = this.db.findSubmodule(diffFileId);
    }
    let fileRec = null;
    let getEntryPromise = null;
    if (foundFileRec == undefined) {
        let oldPath = patch.oldFile().path();
        let newPath = patch.newFile().path();
        //console.log('  oldPath:', oldPath);
        //console.log('  newPath:', newPath);
        let patchStatus = null;
        if (oldPath != null && newPath != null && oldPath != newPath || patch.isRenamed()) {
            patchStatus = JSONDatabase.STATUS.MOVED;
        } else if (patch.isAdded()) {
            patchStatus = JSONDatabase.STATUS.ADDED;
        } else if (patch.isDeleted()) {
            patchStatus = JSONDatabase.STATUS.DELETED;
        } else if (patch.isUnmodified()) {
            patchStatus = JSONDatabase.STATUS.UNMODIFIED;
        } else {
            patchStatus = JSONDatabase.STATUS.MODIFIED;
        }
        console.assert(patchStatus != null, '[GitPipe#createFile] Error: patchStatus not defined!');
        //console.log('  patchStatus:', patchStatus);
        let statistic = new JSONDatabase.Statistic(0, 0, 0);
        getEntryPromise = recentCommit.getEntry(newPath).catch(err => {
            return oldCommit.getEntry(oldPath);
        });
        let isBlob = false;
        let isSubmod = false;
        return getEntryPromise.then(entry => {
            if (entry.isBlob()) {
                isBlob = true;
                //console.log('  Blob...');
                return entry.getBlob();
            } else if (entry.isSubmodule()) {
                isSubmod = true;
                //console.log('  Submodule...');
                //return Git.Submodule.lookup(this.gitRepo, entry.name());
                return null;
            }
        }).then(entryObject => {
            if (isBlob) {
                fileRec = new JSONDatabase.FileRecord();
                fileRec.id = diffFileId;
                fileRec.oldId = oldId;
                fileRec.oldName = oldPath != null ? path.basename(oldPath) : null;
                fileRec.name = newPath != null ? path.basename(newPath) : null;
                fileRec.oldPath = oldPath;
                fileRec.path = newPath;
                fileRec.isBinary = entryObject.isBinary();
                fileRec.status = patchStatus;
                fileRec.statistic = statistic;
            } else if (isSubmod) {
                fileRec = new JSONDatabase.SubmoduleRecord();
                fileRec.id = diffFileId;
                fileRec.oldId = oldId;
                fileRec.oldName = oldPath != null ? path.basename(oldPath) : null;
                fileRec.name = newPath != null ? path.basename(newPath) : null;
                fileRec.oldPath = oldPath;
                fileRec.path = newPath;
                //fileRec.url = entryObject.url();
                fileRec.status = patchStatus;
                //console.log('  submodule url:', fileRec.url);
            }
            console.assert(fileRec != null, '[GitPipe#createFile] Error: Failed to create file.');
            return patch.hunks();
        }).then(hunks => {
            if (isBlob && !fileRec.isBinary) {
                let hunkPromises = [];
                hunks.forEach(hunk => {
                    hunkPromises.push(hunk.lines());
                });
                return Promise.all(hunkPromises);
            }
        }).then(listLines => {
            if (isBlob) {
                //console.log('  parsing lines...');
                if (!fileRec.isBinary && listLines != null) {
                    listLines.forEach(lines => {
                        this.parseLines(fileRec, lines);
                    });
                }
                //console.log('  adding file to db.');
                this.db.addFile(fileRec);
            } else if (isSubmod) {
                //console.log('  adding submodule to db.');
                this.db.addSubmodule(fileRec);
            }
            return fileRec;
        }).catch(err => {
            console.error(err);
        });;
    } else return new Promise(resolve => resolve(foundFileRec));
};

/**
 * Analisa e cria o registro das linhas do patch relacionado.
 * @sync
 * @param {JSONDatabase.FileRecord} fileRec Arquivo com o qual as linhas criadas serão associadas.
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
                        && (lastLine == null
                            || oldLineNum === lastLine.oldLineno() + 1)) {
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
 * @async
 * @param {Git.Commit} oldCommit Utilizado para recuperar o objeto tree mais antigo.
 * @param {Git.Commit} recentCommit Utilizado para recuperar o objeto tree mais recente.
 * @param {JSONDatabase.EntryRecord} child Filho do diretório a ser criado.
 * @param {JSONDatabase.Statistic} carryStatistic Utilizado para atualizar estatísticas dos diretórios já existentes.
 * @param {Boolean} carryStatus Utilizado para atualizar o status dos diretórios já existentes.
 * @return {JSONDatabase.DirectoryRecord} O último diretório criado (diretório raíz).
 */
GitPipe.prototype.createDirectories = function (oldCommit, recentCommit, child, carryStatistic, carryStatus) {
    let dirPath = path.dirname(child.path);
    if (dirPath.length <= 0) {
        //console.log('[GitPipe#createDirectories] Invalid dirPath, ignoring directory: "' + dirPath + '"');
        return new Promise(resolve => resolve(null));
    } else {
        //console.log('> createDirectories(path = ' + dirPath + ')');
        //console.log('  child:', child);
        let isRoot = dirPath === '.';
        let getTreePromise = null;
        let tree = null;
        if (isRoot) {
            if (recentCommit != null) {
                getTreePromise = recentCommit.getTree().then(rct => {
                    tree = rct;
                });
            } else {
                getTreePromise = new Promise(resolve => {
                    tree = null;
                    resolve();
                });
            }
        } else {
            if (recentCommit != null) {
                getTreePromise = recentCommit.getEntry(dirPath).then(e2 => {
                    console.assert(e2.isTree(), '[GitPipe#createDirectories] Error: Entry is not a tree.');
                    return e2.getTree();
                }).then(e2t => {
                    tree = e2t;
                }).catch(err => {
                    if (!child.isDirectory()) {
                        dirPath = path.dirname(child.oldPath);
                        return oldCommit.getEntry(dirPath).then(oe2 => {
                            console.assert(oe2.isTree(), '[GitPipe#createDirectories] Error: Entry is not a tree.');
                            return oe2.getTree();
                        }).then(oe2t => {
                            tree = oe2t;
                        });
                    }
                });
            } else {
                getTreePromise = new Promise(resolve => {
                    tree = null;
                    resolve();
                });
            }
        }
        return getTreePromise.then(() => {
            //console.log('  oldTree:', oldTree);
            //console.log('  tree:', tree);
            let treeId = null;
            if (tree != null) {
                treeId = tree.id().toString();
            }
            if (treeId == null) {
                console.error('[GitPipe#createDirectories] Error: Null tree ID. Path:', dirPath);
            }
            let foundDirRec = this.db.findDirectory(treeId);
            //console.log('  foundDirRec:', foundDirRec);
            if (foundDirRec == undefined) { // Diretório ainda não existe
                //console.log('    Directory ' + dirPath + ' doesnt exists yet. Creating a new one.');
                let newDirRec = new JSONDatabase.DirectoryRecord();
                newDirRec.id = treeId;
                newDirRec.name = isRoot ? '' : path.basename(dirPath);
                newDirRec.path = dirPath;
                newDirRec.statistic = new JSONDatabase.Statistic(0, 0, 0);
                if (child.isFile() || child.isSubmodule()) {
                    if (child.isAdded()) {
                        newDirRec.statistic.added++;
                    } else if (child.isDeleted()) {
                        newDirRec.statistic.deleted++;
                    } else if (child.isModified()) {
                        newDirRec.statistic.modified++;
                    }
                } else if (child.isDirectory()) {
                    newDirRec.statistic.added += child.statistic.added;
                    newDirRec.statistic.deleted += child.statistic.deleted;
                    newDirRec.statistic.modified += child.statistic.modified;
                }
                newDirRec.entriesId.push(child.id);
                if (!child.isMoved()) {
                    newDirRec.status = child.status;
                } else {
                    newDirRec.status = JSONDatabase.STATUS.ADDED;
                }
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
                //    console.assert(foundEntry != null, '[GitPipe#createDirectories] Error: Entry not found, loose id.');
                //    if (foundEntry.name === child.name) {
                //        break;
                //    } else {
                //        foundEntry = null;
                //    }
                //}
                //console.log('      -> foundEntry:', foundEntry);
                if (foundEntryId == undefined) { // Ainda não existe entry
                    if (child.isFile() || child.isSubmodule()) {
                        if (child.isAdded()) {
                            carryStatistic.added++;
                        } else if (child.isDeleted()) {
                            carryStatistic.deleted++;
                        } else if (child.isModified()) {
                            carryStatistic.modified++;
                        }
                    } else if (child.isDirectory()) {
                        //console.log(foundDirRec.path + ' statistic:', foundDirRec.statistic);
                        carryStatistic.added += child.statistic.added;
                        carryStatistic.deleted += child.statistic.deleted;
                        carryStatistic.modified += child.statistic.modified;
                    }
                    //console.log('      Entry' + child.path + ' doesnt exists yet, adding to found dir ' + dirPath);
                    foundDirRec.entriesId.push(child.id);
                }
                if (foundDirRec.status != child.status) {
                    carryStatus = true;
                }
                if (carryStatus) {
                    foundDirRec.status = JSONDatabase.STATUS.MODIFIED;
                }
                foundDirRec.statistic.added += carryStatistic.added;
                foundDirRec.statistic.deleted += carryStatistic.deleted;
                foundDirRec.statistic.modified += carryStatistic.modified;
                child = foundDirRec;
            }
            if (isRoot) {
                return child;
            } else {
                return this.createDirectories(oldCommit, recentCommit, child, carryStatistic);
            }
        }).catch(err => {
            console.error(err);
        });
    }
};

/**
 * Salva a base de dados em arquivo.
 * @sync
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
 * @sync
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

/**
 * Recupera as diferenças do último commit do repositório.
 * @async
 * @return {DirectoryRecord} Hierarquia de diretório contendo os arquivos modificados.
 */
GitPipe.prototype.getHeadDiffTree = function () {
    if (this.db == null) {
        console.error('[GitPipe#getHeadDiffTree] Error: Database not set.');
        return null;
    }
    let repoRec = this.db.getRepository();
    if (repoRec == null) {
        console.error('[GitPipe#getHeadDiffTree] Error: Repository not opened.');
        return null;
    }
    let headId = repoRec.head;
    let commit = this.db.findCommit(headId);
    let parentIds = commit.parents;
    let diff = null;
    let diffDir = null;
    let rootDirId = null;
    let rootDir = null;
    let count = 0;
    let mergePromise = new Promise(resolve => resolve(null));
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
                mergePromise = mergePromise.then(() => {
                    return this.db.hierarchize(rootDirId);
                }).then(hdir => {
                    console.assert(hdir != null, '[GitPipe#getHeadDiffTree] Error: Hierarchized directory result null.');
                    if (diffDir != null) {
                        diffDir = this.db.mergeDirectories(diffDir, hdir);
                    } else {
                        diffDir = hdir;
                    }
                    console.assert(diffDir != null, '[GitPipe#getHeadDiffTree] Error: diffDir is null.');
                });
                //if (diffDir == null) {
                //    diffDir = this.db.hierarchize(rootDirId);
                //    console.assert(diffDir != null, '[GitPipe#getHeadDiffTree] Error: Hierarchized directory result null.');
                //} else {
                //    rootDir = this.db.hierarchize(rootDirId);
                //    console.assert(rootDir != null, '[GitPipe#getHeadDiffTree] Error: Hierarchized directory result null.');
                //    diffDir = this.db.mergeDirectories(diffDir, rootDir);
                //    console.assert(diffDir != null, '[GitPipe#getHeadDiffTree] Error: diffDir is null.');
                //}
            }
        }
    });
    //console.log('-> Merged ' + count + ' directories!');
    return mergePromise.then(() => {
        if (diffDir == null) {
            if (parentIds == null || parentIds.length === 0) {
                //console.log('First commit.');
                diff = this.db.findDiff(null, headId);
                if (diff != undefined) {
                    rootDirId = diff.rootDirId;
                    diffDir = this.db.hierarchize(rootDirId);
                }
            } else {
                //console.log('There is no changes.');
                diff = this.db.findDiff(parentIds[0], headId);
                if (diff != undefined) {
                    rootDirId = diff.rootDirId;
                    diffDir = this.db.hierarchize(rootDirId);
                }
            }
        }
        return diffDir;
    });
};

/**
 * Recupera todos commits da base de dados.
 * @sync
 */
GitPipe.prototype.getCommits = function () {
    return this.db.getCommits();
};

/**
 * Salva temporariamente um commit para ser usado posteriormente.
 * @async
 */
GitPipe.prototype.selectCommit = function (commitId) {
    return new Promise((resolve, reject) => {
        if (this.selectedCommit != null) {
            let previousSelectedCommitId = this.selectedCommit.id;
            if (previousSelectedCommitId === commitId) {
                resolve(false);
            }
        }
        this.selectedCommit = this.db.findCommit(commitId);
        if (this.selectedCommit != undefined) {
            resolve(true);
        } else {
            reject('Selected commit not found.');
        }
    }).catch(err => {
        console.error(err);
    });
};

/**
 * Cria o diff do commit atualmente selecionado, se houver.
 * @async
 */
GitPipe.prototype.registerSelectedCommitDiff = function () {
    return this.diffCommitWithParents(this.selectedCommit);
};

/**
 * Recupera as diferenças do commit selecionado (com seus commits antecessores).
 * @async
 */
GitPipe.prototype.getSelectedCommitDiffTree = function () {
    if (this.db == null) {
        console.error('[GitPipe#getSelectedCommitDiffTree] Error: Database not set.');
        return null;
    }
    if (this.selectedCommit == null) {
        console.error('[GitPipe#getSelectedCommitDiffTree] Error: No commit selected.');
        return null;
    }
    let repoRec = this.db.getRepository();
    if (repoRec == null) {
        console.error('[GitPipe#getSelectedCommitDiffTree] Error: Repository not opened.');
        return null;
    }
    let parentIds = this.selectedCommit.parents;
    let selectedCommitId = this.selectedCommit.id;
    let diff = null;
    let diffDir = null;
    let rootDirId = null;
    let rootDir = null;
    let count = 0;
    let mergePromise = new Promise(resolve => resolve(null));
    parentIds.forEach(parentId => {
        diff = this.db.findDiff(parentId, selectedCommitId);
        if (diff != undefined) {
            rootDirId = diff.rootDirId;
            let ids = rootDirId.split(':');
            if (ids[0] !== ids[1]) {
                count++;
                mergePromise = mergePromise.then(() => {
                    return this.db.hierarchize(rootDirId);
                }).then(hdir => {
                    console.assert(hdir != null, '[GitPipe#getSelectedCommitDiffTree] Error: Hierarchized directory result null.');
                    if (diffDir != null) {
                        diffDir = this.db.mergeDirectories(diffDir, hdir);
                    } else {
                        diffDir = hdir;
                    }
                    console.assert(diffDir != null, '[GitPipe#getSelectedCommitDiffTree] Error: diffDir is null.');
                });
                //if (diffDir == null) {
                //    diffDir = this.db.hierarchize(rootDirId);
                //    console.assert(diffDir != null, '[GitPipe#getSelectedCommitDiffTree] Error: Hierarchized directory result null.');
                //} else {
                //    rootDir = this.db.hierarchize(rootDirId);
                //    console.assert(rootDir != null, '[GitPipe#getSelectedCommitDiffTree] Error: Hierarchized directory result null.');
                //    diffDir = this.db.mergeDirectories(diffDir, rootDir);
                //    console.assert(diffDir != null, '[GitPipe#getSelectedCommitDiffTree] Error: diffDir is null.');
                //}
            }
        }
    });
    //console.log('-> Merged changes from ' + count + ' diffs.');
    return mergePromise.then(() => {
        if (diffDir == null) {
            if (parentIds == null || parentIds.length === 0) {
                //console.log('First commit.');
                diff = this.db.findDiff(null, selectedCommitId);
                if (diff != undefined) {
                    rootDirId = diff.rootDirId;
                    diffDir = this.db.hierarchize(rootDirId);
                }
            } else {
                //console.log('There is no changes.');
                diff = this.db.findDiff(parentIds[0], selectedCommitId);
                if (diff != undefined) {
                    rootDirId = diff.rootDirId;
                    diffDir = this.db.hierarchize(rootDirId);
                }
            }
        }
        return diffDir;
    });
};

module.exports = GitPipe;
