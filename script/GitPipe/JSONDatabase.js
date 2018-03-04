const path = require('path');
const fs = require('fs');
const async = require('async');

/**
 * Definition of JSON database.
 * @param {string} rootPath Path to the folder where the json files will be stored.
 * @constructor
 */
export class JSONDatabase {
    constructor(rootPath) {
        this._rootPath = rootPath;
        this._repository = null;
        this._commits = [];
        this._diffs = [];
        this._authors = [];
        this._dirs = [];
        this._files = [];
        this._submodules = [];
        this._saved = true;
        console.log('creating database directory:', this._rootPath);
        fs.mkdir(this._rootPath, () => {});
    }

    saveToDisk() {
        let error = false;
        if (this._repository != null && this._rootPath != null) {
            fs.writeFile(this._rootPath + path.sep + 'repository.json', JSON.stringify(this._repository, null, 4), (err) => {
                if (err) {
                    console.error('Error:', err);
                    error = true;
                }
            });
        } else error = true;
        if (!error && this._commits.length > 0) {
            fs.writeFile(this._rootPath + path.sep + 'commits.json', JSON.stringify(this._commits, null, 4), (err) => {
                if (err) {
                    console.error('Error:', err);
                    error = true;
                }
            });
        }
        if (!error && this._diffs.length > 0) {
            fs.writeFile(this._rootPath + path.sep + 'diffs.json', JSON.stringify(this._diffs, null, 4), (err) => {
                if (err) {
                    console.error('Error:', err);
                    error = true;
                }
            });
        }
        if (!error && this._authors.length > 0) {
            fs.writeFile(this._rootPath + path.sep + 'authors.json', JSON.stringify(this._authors, null, 4), (err) => {
                if (err) {
                    console.error('Error:', err);
                    error = true;
                }
            });
        }
        if (!error && this._dirs.length > 0) {
            fs.writeFile(this._rootPath + path.sep + 'dirs.json', JSON.stringify(this._dirs, null, 4), (err) => {
                if (err) {
                    console.error('Error:', err);
                    error = true;
                }
            });
        }
        if (!error && this._files.length > 0) {
            fs.writeFile(this._rootPath + path.sep + 'files.json', JSON.stringify(this._files, null, 4), (err) => {
                if (err) {
                    console.error('Error:', err);
                    error = true;
                }
            });
        }
        this._saved = !error;
        return this._saved;
    }

    recoverFromDisk() {
        let error = false;
        if (this._rootPath != null) {
            fs.readFile(this._rootPath + path.sep + 'repository.json', 'utf8', (err, repositoryJson) => {
                if (err) {
                    console.error('Error:', err);
                    error = true;
                }
                this._repository = JSON.parse(repositoryJson);
            });
        } else {
            console.error('[JSONDatabase#recoverFromDisk] Error: Database path not set.');
            return false;
        }
        if (!error) {
            fs.readFileSync(this._rootPath + path.sep + 'commits.json', 'utf8', (err, commitsJson) => {
                if (err) console.error('Error:', err);
                this._commits = JSON.parse(commitsJson);
            });
        }
        if (!error) {
            fs.readFileSync(this._rootPath + path.sep + 'diffs.json', 'utf8', (err, diffsJson) => {
                if (err) console.error('Error:', err);
                this._diffs = JSON.parse(diffsJson);
            });
        }
        if (!error) {
            fs.readFileSync(this._rootPath + path.sep + 'authors.json', 'utf8', (err, authorsJson) => {
                if (err) console.error('Error:', err);
                this._authors = JSON.parse(authorsJson);
            });
        }
        if (!error) {
            fs.readFile(this._rootPath + path.sep + 'directories.json', 'utf8', (err, dirsJson) => {
                if (err) console.error('Error:', err);
                this._dirs = JSON.parse(dirsJson);
            });
        }
        if (!error) {
            fs.readFile(this._rootPath + path.sep + 'files.json', 'utf8', (err, filesJson) => {
                if (err) console.error('Error:', err);
                this._files = JSON.parse(filesJson);
            });
        }
        this._saved = !error;
        return this._saved;
    }

    set rootPath(rootPath) {
        this._rootPath = rootPath;
    }

    get rootPath() {
        return this._rootPath;
    }

    set repository(repositoryRec) {
        if (this._repository != repositoryRec) {
            this._repository = repositoryRec;
            this._saved = false;
        }
    }

    get repository() {
        return this._repository;
    }

    get commits() {
        return this._commits.slice(0);
    }

    incCommitCount() {
        this._repository.commitCount++;
    }

    addCommit(commitRec) {
        let commitId = commitRec.id;
        let foundCommit = this.findCommit(commitId);
        if (foundCommit == undefined) {
            this._commits.push(commitRec);
            this._saved = false;
            return true;
        } else return false;
    }

    findCommit(commitId) {
        return this._commits.find(commit => commit.id === commitId);
    }

    deleteCommit(commitId) {
        let foundCommit = this.findCommit(commitId);
        if (foundCommit != null) {
            this._commits.splice(this._commits.indexOf(foundCommit), 1);
            this._saved = false;
            return foundCommit;
        } else return null;
    }

    addDiff(diffRec) {
        let foundDiff = this.findDiff(diffRec.oldCommitId, diffRec.recentCommitId);
        if (foundDiff == undefined) {
            this._diffs.push(diffRec);
            this._saved = false;
            return true;
        } else return false;
    }

    findDiff(oldCommitId, recentCommitId) {
        if (recentCommitId == null) {
            console.error('[JSONDatabase#findDiff] Error: recentCommitId is null.');
            return undefined;
        } else {
            if (oldCommitId == null) {
                return this._diffs.find(diff =>
                    diff.oldCommitId == null && diff.recentCommitId === recentCommitId);
            } else {
                return this._diffs.find(diff =>
                    diff.oldCommitId === oldCommitId && diff.recentCommitId === recentCommitId);
            }
        }
    }

    deleteDiff(oldCommitId, recentCommitId) {
        let foundDiff = this.findDiff(oldCommitId, recentCommitId);
        if (foundDiff != undefined) {
            this._diffs.splice(this._diffs.indexOf(foundDiff), 1);
            this._saved = false;
            return foundDiff;
        } else return null;
    }

    addAuthor(authorRec) {
        let authorEmail = authorRec.email;
        let foundAuthor = this.findAuthor(authorEmail);
        if (foundAuthor == undefined) {
            this._authors.push(authorRec);
            this._saved = false;
            return true;
        } else return false;
    }

    findAuthor(authorEmail) {
        return this._authors.find(author => author.email === authorEmail);
    }

    deleteAuthor(authorEmail) {
        let foundAuthor = this.findAuthor(authorEmail);
        if (foundAuthor != undefined) {
            this._authors.splice(this._authors.indexOf(foundAuthor), 1);
            this._saved = false;
            return foundAuthor;
        } else return null;
    }

    addDirectory(directoryRec) {
        let foundDir = this.findDirectory(directoryRec.id);
        if (foundDir == undefined) {
            this._dirs.push(directoryRec);
            this._saved = false;
            return true;
        } else return false;
    }

    findDirectory(directoryId) {
        return this._dirs.find(dir => dir.id === directoryId);
    }

    deleteDirectory(directoryId) {
        let foundDir = this._dirs.find(dir => dir.id === directoryId);
        if (foundDir != undefined) {
            this._dirs.splice(this._dirs.indexOf(foundDir), 1);
            this._saved = false;
            return foundDir;
        } else return null;
    }

    addFile(fileRec) {
        let foundFile = this.findFile(fileRec.id);
        if (foundFile == undefined) {
            this._files.push(fileRec);
            this._saved = false;
            return true;
        } else return false;
    }

    findFile(fileId) {
        return this._files.find(file => file.id === fileId);
    }

    deleteFile(fileId) {
        let foundFile = this.findFile(fileId);
        if (foundFile != undefined) {
            this._files.splice(this._files.indexOf(foundFile), 1);
            this._saved = false;
            return foundFile;
        } else return null;
    }

    addSubmodule(submoduleRec) {
        let foundSubmodule = this.findSubmodule(submoduleRec.id);
        if (foundSubmodule == undefined) {
            this._submodules.push(submoduleRec);
            this._saved = false;
            return true;
        } else return false;
    }

    findSubmodule(submoduleId) {
        return this._submodules.find(sub => sub.id === submoduleId);
    }

    deleteSubmodule(submoduleId) {
        let foundSubmodule = this.findSubmodule(submoduleId);
        if (foundSubmodule != undefined) {
            this._submodules.splice(this._submodules.indexOf(foundSubmodule), 1);
            this._saved = false;
            return foundSubmodule;
        } else return null;
    }

    findEntry(entryId) {
        let result = this.findDirectory(entryId);
        if (result == undefined) result = this.findFile(entryId);
        if (result == undefined) result = this.findSubmodule(entryId);
        return result;
    }

    /**
     * Convert id references to hierarchy.
     * @async
     * @param {String} rootId The root directory id.
     */
    hierarchize(rootId) {
        return new Promise((resolve, reject) => {
            let root = this.findEntry(rootId);
            //let hierarchizePromises = [];
            if (root == undefined) {
                reject('Entry not found (loose id).');
                //console.error('Entry not found (loose id).');
            }
            if (root.isDirectory()) {
                let entriesId = root.entriesId;
                root.entries = [];
                //entriesId.forEach(entryId => {
                //    if (typeof(entryId) !== 'string') {
                //        //reject('Entry ID is not a string.');
                //        console.error('Entry ID is not a string.');
                //    }
                //    //let prom = (function (self, entryId) {
                //    //    return self.hierarchize(entryId).then(entry => {
                //    //        root.entries.push(entry);
                //    //    });
                //    //}(this, entryId));
                //    //hierarchizePromises.push(prom);
                //    //setTimeout(() => {
                //        let entry = this.hierarchize(entryId);
                //        root.entries.push(entry);
                //    //}, 1);
                //});
                async.eachSeries(entriesId, (entryId, next) => {
                    if (typeof(entryId) !== 'string') {
                        reject('Entry ID is not a string.');
                    }
                    this.hierarchize(entryId).then(entry => {
                        root.entries.push(entry);
                        setTimeout(() => {
                            next();
                        }, 0);
                    });
                }, err => {
                    if (err) reject(err);
                    else resolve(root);
                });
                //return Promise.all(entriesId.map(entryId => {
                //    return new Promise((resolve, reject) => {
                //        if (typeof(entryId) !== 'string') {
                //            reject('Entry ID is not a string.');
                //        }
                //        this.hierarchize(entryId).then(entry => {
                //            root.entries.push(entry);
                //            resolve();
                //        });
                //    });
                //})).then(() => {
                //    return root;
                //});
            } else resolve(root);
            //Promise.all(hierarchizePromises).then(() => {
            //    resolve(root);
            //});
            //return root;
        });
    }

    /**
     * Merge the directories hierarchies.
     * @param {JSONDatabase.DirectoryRecord} dir1
     * @param {JSONDatabase.DirectoryRecord} dir2
     * @return One directory with dir1 and dir2 descendants.
     */
    mergeDirectories(dir1, dir2) {
        if (dir1 == null || dir2 == null) {
            console.error('[JSONDatabase#mergeDirectories] Error: Cannot merge null directories.');
            return null;
        } else if (!dir1.isDirectory() || !dir2.isDirectory()) {
            console.error('[JSONDatabase#mergeDirectories] Error: Cannot merge non directories.');
            return null;
        } else if (dir1.entries == undefined || dir2.entries == undefined) {
            console.error('[JSONDatabase#mergeDirectories] Error: The directories must be hierarchized.');
        } else {
            console.log('> mergeDirectories()');
            console.log('dir1:', dir1);
            console.log('dir2:', dir2);
            if (dir1.name.trim() === dir2.name.trim()) {
                let mergedDir = new JSONDatabase.DirectoryRecord();
                let toMergeDir1 = dir1.entries.filter(e1 => e1.isDirectory() && dir2.entries.filter(ef2 => ef2.isDirectory).map(e2 => e2.name).includes(e1.name));
                let toMergeDir2 = dir2.entries.filter(e2 => e2.isDirectory() && toMergeDir1.map(e1 => e1.name).includes(e2.name));
                mergedDir.id = dir1.id + ':' + dir2.id;
                mergedDir.name = dir1.name;
                mergedDir.path = dir1.path;
                mergedDir.statistic =
                    new JSONDatabase.Statistic(dir1.statistic.added + dir2.statistic.added, dir1.statistic.deleted + dir2.statistic.deleted, dir1.statistic.modified + dir2.statistic.modified);
                if (dir1.status === dir2.status) {
                    mergedDir.status = dir1.status;
                } else {
                    mergedDir.status = JSONDatabase.STATUS.MODIFIED;
                }
                mergedDir.entries = dir1.entries.filter(e1 => !toMergeDir1.includes(e1)).concat(dir2.entries.filter(e2 => !toMergeDir2.includes(e2) && !toMergeDir1.includes(e2) && !dir1.entriesId.includes(e2.id)));
                toMergeDir1.forEach(e1 => {
                    let e2 = toMergeDir2.find(v => v.name === e1.name);
                    console.assert(e1.isDirectory() && e2.isDirectory(), '[JSONDatabase#mergeDirectories] Error: Entries is not directories.');
                    let mergedEntries = this.mergeDirectories(e1, e2);
                    mergedDir.entries.push(mergedEntries);
                });
                return mergedDir;
            } else {
                console.error('[JSONDatabase#mergeDirectories] Error: To merge, the directories names must be the same.')
                return null;
            }
        }
    }
}

/**
 * Registro do diretório.
 * @constructor
 */
JSONDatabase.DirectoryRecord = function () {
    JSONDatabase.EntryRecord.call(this, JSONDatabase.ENTRYTYPE.DIRECTORY);
    this.entriesId = [];
};
JSONDatabase.DirectoryRecord.prototype = Object.create(JSONDatabase.EntryRecord.prototype);
JSONDatabase.DirectoryRecord.constructor = JSONDatabase.DirectoryRecord;

/**
 * Registro do diff arquivo.
 * @constructor
 */
JSONDatabase.FileRecord = function () {
    JSONDatabase.EntryRecord.call(this, JSONDatabase.ENTRYTYPE.FILE);
    this.isBinary = false;
    this.oldId = null;
    this.oldName = null;
    this.oldPath = null;
    this.blocks = [];
    this.lastBlockIndex = -1;
};
JSONDatabase.FileRecord.prototype = Object.create(JSONDatabase.EntryRecord.prototype);
JSONDatabase.FileRecord.constructor = JSONDatabase.FileRecord;

JSONDatabase.FileRecord.prototype.isBinary = function () {
    return this.isBinary;
};

JSONDatabase.FileRecord.prototype.addBlock = function (oldLines, newLines, status) {
    let blockRec = new JSONDatabase.BlockRecord();
    blockRec.index = ++this.lastBlockIndex;
    blockRec.status = status;
    if (status === JSONDatabase.STATUS.ADDED) {
        blockRec.newLines = newLines;
        this.statistic.added += newLines.length;
    } else if (status === JSONDatabase.STATUS.DELETED) {
        blockRec.oldLines = oldLines;
        this.statistic.deleted += oldLines.length;
    } else {
        console.assert(status === JSONDatabase.STATUS.MODIFIED, '[JSONDatabase.FileRecord#addBlock] Error: Unknown status passed.');
        this.statistic.modified += oldLines.length;
        blockRec.oldLines = oldLines;
        if (newLines.length > oldLines.length) {
            blockRec.newLines = newLines.slice(0, oldLines.length);
            newLines = newLines.slice(oldLines.length);
            let addedBlock = new JSONDatabase.BlockRecord();
            addedBlock.index = ++this.lastBlockIndex;
            addedBlock.status = JSONDatabase.STATUS.ADDED;
            addedBlock.newLines = newLines;
            this.statistic.added += newLines.length;
            this.blocks.push(addedBlock);
        } else {
            blockRec.newLines = newLines;
        }
    }
    this.blocks.push(blockRec);
};

/**
 * Registro do submódulo.
 * @param {NodeGit.Submodule} submodule Submódulo do repositório git.
 */
JSONDatabase.SubmoduleRecord = function () {
    JSONDatabase.EntryRecord.call(this, JSONDatabase.ENTRYTYPE.SUBMODULE);
    this.url = null;
    this.oldId = null;
    this.oldName = null;
    this.oldPath = null;
};
JSONDatabase.SubmoduleRecord.prototype = Object.create(JSONDatabase.EntryRecord.prototype);
JSONDatabase.SubmoduleRecord.constructor = JSONDatabase.SubmoduleRecord;

/**
 * Registro do bloco do arquivo, com as linhas que foram modificadas.
 *
 */
JSONDatabase.BlockRecord = function () {
    this.index = -1;
    this.status = -1;
    this.newLines = null;
    this.oldLines = null;
};

JSONDatabase.BlockRecord.prototype.isAdded = function () {
    return this.status === JSONDatabase.STATUS.ADDED;
};

JSONDatabase.BlockRecord.prototype.isDeleted = function () {
    return this.status === JSONDatabase.STATUS.DELETED;
};

JSONDatabase.BlockRecord.prototype.isModified = function () {
    return this.status === JSONDatabase.STATUS.MODIFIED;
};

JSONDatabase.BlockRecord.prototype.isUnmodified = function () {
    return this.status === JSONDatabase.STATUS.UNMODIFIED;
};

JSONDatabase.BlockRecord.prototype.isMoved = function () {
    return this.status === JSONDatabase.STATUS.MOVED;
};

/**
 * Registro da diff linha.
 * @constructor
 */
JSONDatabase.LineRecord = function () {
    this.lineNum = -1;
    this.content = null;
};

/**
 * Tipo de entrada para diretório.
 * @enum
 */
JSONDatabase.ENTRYTYPE = {
    FILE: 0,
    DIRECTORY: 1,
    SUBMODULE: 2
};

JSONDatabase.STATUS = {
    ADDED: 0,
    DELETED: 1,
    MODIFIED: 2,
    UNMODIFIED: 3,
    MOVED: 4
};

module.exports = JSONDatabase;
