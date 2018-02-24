'use strict';

const Git = require('nodegit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const JSONDatabase = require('./JSONDatabase');

/**
 * A module to get the repository (meta)data.
 * @constructor
 * @param {String} dbPath Path to repository database.
 */
function GitPipe(dbPath) {
    this.gitRepo = null;
    this.selectedCommit = null;
    this.diffs = [];
    if (dbPath == null) {
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
 * Open the repository and save on database.
 * @async
 * @param {String} repoPath Path to repository.
 * @return {String} Path to database.
 */
GitPipe.prototype.openRepository = function (repoPath) {
    let pathToRepo = path.resolve(repoPath);
    let repoRec = null;
    let dbPath = null;
    return Git.Repository.open(pathToRepo).then(repo => {
        this.gitRepo = repo;
        // Subdirectory where all database (for each repository) are saved.
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
 * Walk through commits history from master commit with event emitter.
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
 * Parse the given commit.
 * @sync
 * @param {Git.Commit} commit
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
 * Records the diff between head commit and its parent.
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
 * Records the diff between the given commit and its parent.
 * @async
 * @param {JSONDatabase.CommitRecord} commitRec The given commit.
 */
GitPipe.prototype.diffCommitWithParents = function (commitRec) {
    let commitId = commitRec.id;
    let commitSnapshotId = commitRec.snapshotId;
    let commitTree = null;
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
                    if (foundDiff == null) {
                        foundDiff = this.db.findDiff(parentId, commitId);
                    }
                    if (foundDiff == null) {
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
                if (foundDiff == null) {
                    foundDiff = this.db.findDiff(null, commitId);
                }
                if (foundDiff == null) {
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
};

/**
 * Parse the temporarily saved diffs and insert into database.
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
 * Parse the given diff.
 * @async
 * @param {Git.Commit} oldCommit The oldest commit.
 * @param {Git.Commit} recentCommit The newest commit.
 * @param {Git.Diff} gitDiff The given diff.
 */
GitPipe.prototype.parseDiff = function (oldCommit, recentCommit, gitDiff) {
    return gitDiff.patches().then(patches => {
        //console.log('patches:', patches);
        return this.parsePatches(oldCommit, recentCommit, patches);
    }).catch(err => {
        console.error(err);
    });
};

/**
 * Call synchronously each patch.
 * @async
 * @param {Git.Commit} oldCommit The oldest commit.
 * @param {Git.Commit} recentCommit The newest commit.
 * @param {Array<Git.Patch>} patches A array of patch.
 * @return {JSONDatabase.DirectoryRecord} Returns a new directory record.
 */
GitPipe.prototype.parsePatches = function (oldCommit, recentCommit, patches) {
    let patch = patches.shift();
    let dirRec = null;
    return this.parsePatch(oldCommit, recentCommit, patch).then(d => {
        if (d != null) dirRec = d;
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
 * Parse the given patch and register the modified directories and files records.
 * @async
 * @param {Git.Commit} oldCommit The oldest commit.
 * @param {Git.Commit} recentCommit The newest commit.
 * @param {Git.ConvenientPatch} patch The given patch.
 * @return {Array<JSONDatabase.DirectoryRecord>} Returns the root directory record.
 */
GitPipe.prototype.parsePatch = function (oldCommit, recentCommit, patch) {
    return this.createFile(oldCommit, recentCommit, patch).then(child => {
        if (child) {
            return this.createDirectories(oldCommit, recentCommit, child, new JSONDatabase.Statistic(0, 0, 0), false);
        } else return null;
    }).catch(err => {
        console.error(err);
    });
};

/**
 * Records a new file to database.
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
        }).catch(err => {
            return null;
        });
        let isBlob = false;
        let isSubmod = false;
        let fileExists = true;
        return getEntryPromise.then(entry => {
            if (entry != null) {
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
            } else {
                fileExists = false;
            }
        }).then(entryObject => {
            if (fileExists) {
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
            }
        }).then(hunks => {
            if (fileExists && isBlob && !fileRec.isBinary) {
                let hunkPromises = [];
                hunks.forEach(hunk => {
                    hunkPromises.push(hunk.lines());
                });
                return Promise.all(hunkPromises);
            }
        }).then(listLines => {
            if (fileExists) {
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
            } else return null;
        }).catch(err => {
            console.error(err);
        });;
    } else return new Promise(resolve => resolve(foundFileRec));
};

/**
 * Parse the file modified lines.
 * @sync
 * @param {JSONDatabase.FileRecord} fileRec The modified lines owner.
 * @param {Array<Git.DiffLine>} lines The modified lines.
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
 * Records the directories from leaf to root node.
 * @async
 * @param {Git.Commit} oldCommit The oldest commit.
 * @param {Git.Commit} recentCommit The newest commit.
 * @param {JSONDatabase.EntryRecord} child The directory child.
 * @param {JSONDatabase.Statistic} carryStatistic To propagate the statistics.
 * @param {Boolean} carryStatus To propagate the children status to parent directories.
 * @return {JSONDatabase.DirectoryRecord} The root directory record.
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
        let getTreePromise = new Promise(resolve => resolve(null));
        let tree = null;
        let isRecentTree = true;
        if (isRoot) {
            if (recentCommit != null) {
                getTreePromise = getTreePromise.then(() => {
                    return recentCommit.getTree().then(rct => {
                        tree = rct;
                    });
                });
            } else {
                getTreePromise = getTreePromise.then(() => {
                    tree = null;
                });
            }
        } else {
            if (recentCommit != null) {
                getTreePromise = getTreePromise.then(() => {
                    return recentCommit.getEntry(dirPath).then(e2 => {
                        console.assert(e2.isTree(), '[GitPipe#createDirectories] Error: Entry is not a tree.');
                        return e2.getTree();
                    }).then(e2t => {
                        tree = e2t;
                    }).catch(err => {
                        if (!child.isDirectory()) {
                            dirPath = path.dirname(child.oldPath);
                        }
                        return oldCommit.getEntry(dirPath).then(oe2 => {
                            console.assert(oe2.isTree(), '[GitPipe#createDirectories] Error: Entry is not a tree.');
                            return oe2.getTree();
                        }).then(oe2t => {
                            tree = oe2t;
                            isRecentTree = false;
                        });
                    });
                });
            } else {
                getTreePromise = getTreePromise.then(() => {
                    tree = null;
                });
            }
        }
        return getTreePromise.then(() => {
            //console.log('  oldTree:', oldTree);
            //console.log('  tree:', tree);
            let treeId = null;
            let ownerCommit = null;
            if (isRecentTree) {
                ownerCommit = recentCommit;
            } else {
                ownerCommit = oldCommit;
            }
            if (ownerCommit != null && tree != null) {
                treeId = ownerCommit.id().toString() + ':' + tree.id().toString();
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
            } else { // The directory already exists.
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
                if (foundEntryId == undefined) { // Entry not founded
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
 * Save database to disk.
 * @sync
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
 * Load database from disk.
 * @sync
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
 * Get the head commit delta.
 * @async
 * @return {DirectoryRecord} The hierarchized root directory record.
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
    let count = 0;
    let mergePromise = new Promise(resolve => resolve(null));
    parentIds.forEach(parentId => {
        //console.log('    -> parentId:', parentId);
        diff = this.db.findDiff(parentId, headId);
        //console.log('    -> diff:', diff);
        if (diff != null) {
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
                if (diff != null) {
                    rootDirId = diff.rootDirId;
                    diffDir = this.db.hierarchize(rootDirId);
                }
            } else {
                //console.log('There is no changes.');
                diff = this.db.findDiff(parentIds[0], headId);
                if (diff != null) {
                    rootDirId = diff.rootDirId;
                    diffDir = this.db.hierarchize(rootDirId);
                }
            }
        }
        return diffDir;
    });
};

/**
 * Get the registered commits.
 * @sync
 */
GitPipe.prototype.getCommits = function () {
    return this.db.getCommits();
};

/**
 * Select the commit by ID.
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
        if (this.selectedCommit != null) {
            resolve(true);
        } else {
            reject('Selected commit not found.');
        }
    }).catch(err => {
        console.error(err);
    });
};

/**
 * Records the selected commit diff with its parent.
 * @async
 */
GitPipe.prototype.registerSelectedCommitDiff = function () {
    return this.diffCommitWithParents(this.selectedCommit);
};

/**
 * Get the selected commit delta.
 * @async
 * @return {DirectoryRecord} The hierarchized root directory record.
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
    let count = 0;
    let mergePromise = new Promise(resolve => resolve(null));
    parentIds.forEach(parentId => {
        diff = this.db.findDiff(parentId, selectedCommitId);
        if (diff != null) {
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
                if (diff != null) {
                    rootDirId = diff.rootDirId;
                    diffDir = this.db.hierarchize(rootDirId);
                }
            } else {
                //console.log('There is no changes.');
                diff = this.db.findDiff(parentIds[0], selectedCommitId);
                if (diff != null) {
                    rootDirId = diff.rootDirId;
                    diffDir = this.db.hierarchize(rootDirId);
                }
            }
        }
        return diffDir;
    });
};

module.exports = GitPipe;
