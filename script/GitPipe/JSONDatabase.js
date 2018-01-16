'use strict';

const path = require('path');
const fs = require('fs');
const async = require('async');

/**
 * Definição da base de dados JSON.
 * @param {string} rootPath Caminho onde será salvo os arquivos JSON.
 * @constructor
 */
function JSONDatabase (rootPath) {
    this.rootPath = rootPath;
    this.repository = null;
    this.commits = [];
    this.diffs = [];
    this.authors = [];
    this.dirs = [];
    this.files = [];
    this.submodules = [];
    this.saved = true;
    console.log('creating database directory:', rootPath);
    fs.mkdir(this.rootPath, () => {});
}

JSONDatabase.prototype.saveToDisk = function () {
    let error = false;
    if (this.repository != null && this.rootPath != null) {
        fs.writeFile(this.rootPath + path.sep + 'repository.json', JSON.stringify(this.repository, null, 4), (err) => {
            if (err) {
                console.error('Error:', err);
                error = true;
            }
        });
    } else error = true;
    if (!error && this.commits.length > 0) {
        fs.writeFile(this.rootPath + path.sep + 'commits.json', JSON.stringify(this.commits, null, 4), (err) => {
            if (err) {
                console.error('Error:', err);
                error = true;
            }
        });
    }
    if (!error && this.diffs.length > 0) {
        fs.writeFile(this.rootPath + path.sep + 'diffs.json', JSON.stringify(this.diffs, null, 4), (err) => {
            if (err) {
                console.error('Error:', err);
                error = true;
            }
        });
    }
    if (!error && this.authors.length > 0) {
        fs.writeFile(this.rootPath + path.sep + 'authors.json', JSON.stringify(this.authors, null, 4), (err) => {
            if (err) {
                console.error('Error:', err);
                error = true;
            }
        });
    }
    if (!error && this.dirs.length > 0) {
        fs.writeFile(this.rootPath + path.sep + 'dirs.json', JSON.stringify(this.dirs, null, 4), (err) => {
            if (err) {
                console.error('Error:', err);
                error = true;
            }
        });
    }
    if (!error && this.files.length > 0) {
        fs.writeFile(this.rootPath + path.sep + 'files.json', JSON.stringify(this.files, null, 4), (err) => {
            if (err) {
                console.error('Error:', err);
                error = true;
            }
        });
    }
    this.saved = !error;
    return this.saved;
};

JSONDatabase.prototype.recoverFromDisk = function () {
    let error = false;
    if (this.rootPath != null) {
        fs.readFile(this.rootPath + path.sep + 'repository.json', 'utf8', (err, repositoryJson) => {
            if (err) {
                console.error('Error:', err);
                error = true;
            }
            this.repository = JSON.parse(repositoryJson);
        });
    } else {
        console.error('[JSONDatabase#recoverFromDisk] Error: Database path not set.');
        return false;
    }
    if (!error) {
        fs.readFileSync(this.rootPath + path.sep + 'commits.json', 'utf8', (err, commitsJson) => {
            if (err) console.error('Error:', err);
            this.commits = JSON.parse(commitsJson);
        });
    }
    if (!error) {
        fs.readFileSync(this.rootPath + path.sep + 'diffs.json', 'utf8', (err, diffsJson) => {
            if (err) console.error('Error:', err);
            this.diffs = JSON.parse(diffsJson);
        });
    }
    if (!error) {
        fs.readFileSync(this.rootPath + path.sep + 'authors.json', 'utf8', (err, authorsJson) => {
            if (err) console.error('Error:', err);
            this.authors = JSON.parse(authorsJson);
        });
    }
    if (!error) {
        fs.readFile(this.rootPath + path.sep + 'directories.json', 'utf8', (err, dirsJson) => {
            if (err) console.error('Error:', err);
            this.dirs = JSON.parse(dirsJson);
        });
    }
    if (!error) {
        fs.readFile(this.rootPath + path.sep + 'files.json', 'utf8', (err, filesJson) => {
            if (err) console.error('Error:', err);
            this.files = JSON.parse(filesJson);
        });
    }
    this.saved = !error;
    return this.saved;
};

JSONDatabase.prototype.setRootPath = function (rootPath) {
    this.rootPath = rootPath;
};

JSONDatabase.prototype.getRootPath = function () {
    return this.rootPath;
};

JSONDatabase.prototype.setRepository = function (repositoryRec) {
    if (this.repository != repositoryRec) {
        this.repository = repositoryRec;
        this.saved = false;
    }
};

JSONDatabase.prototype.incCommitCount = function () {
    this.repository.commitCount++;
};

JSONDatabase.prototype.getRepository = function () {
    return this.repository;
};

JSONDatabase.prototype.getCommits = function () {
    return this.commits.slice(0);
};

JSONDatabase.prototype.addCommit = function (commitRec) {
    let commitId = commitRec.id;
    let foundCommit = this.findCommit(commitId);
    if (foundCommit == undefined) {
        this.commits.push(commitRec);
        this.saved = false;
        return true;
    } else return false;
};

JSONDatabase.prototype.findCommit = function (commitId) {
    return this.commits.find(commit => commit.id === commitId);
};

JSONDatabase.prototype.deleteCommit = function (commitId) {
    let foundCommit = this.findCommit(commitId);
    if (foundCommit != null) {
        this.commits.splice(this.commits.indexOf(foundCommit), 1);
        this.saved = false;
        return foundCommit;
    } else return null;
};

JSONDatabase.prototype.addDiff = function (diffRec) {
    let foundDiff = this.findDiff(diffRec.oldCommitId, diffRec.recentCommitId);
    if (foundDiff == undefined) {
        this.diffs.push(diffRec);
        this.saved = false;
        return true;
    } else return false;
};

JSONDatabase.prototype.findDiff = function (oldCommitId, recentCommitId) {
    if (recentCommitId == null) {
        console.error('[JSONDatabase#findDiff] Error: recentCommitId is null.');
        return undefined;
    } else {
        if (oldCommitId == null) {
            return this.diffs.find(diff =>
                diff.oldCommitId == null && diff.recentCommitId === recentCommitId);
        } else {
            return this.diffs.find(diff =>
                diff.oldCommitId === oldCommitId && diff.recentCommitId === recentCommitId);
        }
    }
};

JSONDatabase.prototype.deleteDiff = function (oldCommitId, recentCommitId) {
    let foundDiff = this.findDiff(oldCommitId, recentCommitId);
    if (foundDiff != undefined) {
        this.diffs.splice(this.diffs.indexOf(foundDiff), 1);
        this.saved = false;
        return foundDiff;
    } else return null;
};

JSONDatabase.prototype.addAuthor = function (authorRec) {
    let authorEmail = authorRec.email;
    let foundAuthor = this.findAuthor(authorEmail);
    if (foundAuthor == undefined) {
        this.authors.push(authorRec);
        this.saved = false;
        return true;
    } else return false;
};

JSONDatabase.prototype.findAuthor = function (authorEmail) {
    return this.authors.find(author => author.email === authorEmail);
};

JSONDatabase.prototype.deleteAuthor = function (authorEmail) {
    let foundAuthor = this.findAuthor(authorEmail);
    if (foundAuthor != undefined) {
        this.authors.splice(this.authors.indexOf(foundAuthor), 1);
        this.saved = false;
        return foundAuthor;
    } else return null;
};

JSONDatabase.prototype.addDirectory = function (directoryRec) {
    let foundDir = this.findDirectory(directoryRec.id);
    if (foundDir == undefined) {
        this.dirs.push(directoryRec);
        this.saved = false;
        return true;
    } else return false;
};

JSONDatabase.prototype.findDirectory = function (directoryId) {
    return this.dirs.find(dir => dir.id === directoryId);
};

JSONDatabase.prototype.deleteDirectory = function (directoryId) {
    let foundDir = this.dirs.find(dir => dir.id === directoryId);
    if (foundDir != undefined) {
        this.dirs.splice(this.dirs.indexOf(foundDir), 1);
        this.saved = false;
        return foundDir;
    } else return null;
};

JSONDatabase.prototype.addFile = function (fileRec) {
    let foundFile = this.findFile(fileRec.id);
    if (foundFile == undefined) {
        this.files.push(fileRec);
        this.saved = false;
        return true;
    } else return false;
};

JSONDatabase.prototype.findFile = function (fileId) {
    return this.files.find(file => file.id === fileId);
};

JSONDatabase.prototype.deleteFile = function (fileId) {
    let foundFile = this.findFile(fileId);
    if (foundFile != undefined) {
        this.files.splice(this.files.indexOf(foundFile), 1);
        this.saved = false;
        return foundFile;
    } else return null;
};

JSONDatabase.prototype.addSubmodule = function (submoduleRec) {
    let foundSubmodule = this.findSubmodule(submoduleRec.id);
    if (foundSubmodule == undefined) {
        this.submodules.push(submoduleRec);
        this.saved = false;
        return true;
    } else return false;
};

JSONDatabase.prototype.findSubmodule = function (submoduleId) {
    return this.submodules.find(sub => sub.id === submoduleId);
};

JSONDatabase.prototype.deleteSubmodule = function (submoduleId) {
    let foundSubmodule = this.findSubmodule(submoduleId);
    if (foundSubmodule != undefined) {
        this.submodules.splice(this.submodules.indexOf(foundSubmodule), 1);
        this.saved = false;
        return foundSubmodule;
    } else return null;
};

/**
 * Pesquisa por um diretório ou arquivo na base de dados.
 * @param {String} entryId - Chave de pesquisa.
 * @return {JSONDatabase.EntryRecord} O diretório ou arquivo encontrado,
 *  undefined caso não encontre.
 */
JSONDatabase.prototype.findEntry = function (entryId) {
    let result = this.findDirectory(entryId);
    if (result == undefined) result = this.findFile(entryId);
    if (result == undefined) result = this.findSubmodule(entryId);
    return result;
};

/**
 * Constrói a hierarquia de diretórios a partir do diretório
 *  com rootId correspondente.
 * @async
 * @param {String} rootId - Chave do diretório raiz.
 */
JSONDatabase.prototype.hierarchize = function (rootId) {
    return new Promise((resolve, reject) => {
        let root = this.findEntry(rootId);
        //let hierarchizePromises = [];
        if (root == undefined) {
            reject('Entry not found (loose id).');
            //console.error('Entry not found (loose id).');
        }
        console.log('found entry:', root.newPath);
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
};

/**
 * Mescla os diretórios passados como parâmetro e retorna os diretórios mesclados.
 * @param {JSONDatabase.DirectoryRecord} dir1
 * @param {JSONDatabase.DirectoryRecord} dir2
 * @return Os diretórios mesclados.
 */
JSONDatabase.prototype.mergeDirectories = function (dir1, dir2) {
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
        if (dir1.getName().trim() === dir2.getName().trim()) {
            let mergedDir = new JSONDatabase.DirectoryRecord();
            let toMergeDir1 = dir1.entries.filter(e1 => e1.isDirectory() && dir2.entries.filter(ef2 => ef2.isDirectory).map(e2 => e2.getName()).includes(e1.getName()));
            let toMergeDir2 = dir2.entries.filter(e2 => e2.isDirectory() && toMergeDir1.map(e1 => e1.getName()).includes(e2.getName()));
            mergedDir.id = dir1.id + ':' + dir2.id;
            mergedDir.oldId = dir1.oldId;
            mergedDir.oldName = dir1.oldName;
            mergedDir.newName = dir1.newName;
            mergedDir.oldPath = dir1.oldPath;
            mergedDir.newPath = dir1.newPath;
            mergedDir.statistic =
                new JSONDatabase.Statistic(dir1.statistic.added + dir2.statistic.added, dir1.statistic.deleted + dir2.statistic.deleted, dir1.statistic.modified + dir2.statistic.modified);
            if (dir1.status === dir2.status) {
                mergedDir.status = dir1.status;
            } else {
                mergedDir.status = JSONDatabase.STATUS.MODIFIED;
            }
            mergedDir.entries = dir1.entries.filter(e1 => !toMergeDir1.includes(e1)).concat(dir2.entries.filter(e2 => !toMergeDir2.includes(e2) && !toMergeDir1.includes(e2) && !dir1.entriesId.includes(e2.id)));
            toMergeDir1.forEach(e1 => {
                let e2 = toMergeDir2.find(v => v.getName() === e1.getName());
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
};

//-------------------------------- Records --------------------------------
/**
 * Registro do repositório.
 * @constructor
 * @param {Git.Repository} repository - Objeto com os dados do repositório.
 */
JSONDatabase.RepositoryRecord = function (repository) {
    if (repository != null) {
        this.isBare = repository.isBare();
        this.path = repository.path();
        this.name = path.basename(repository.path().replace(/\/.git\/?$/, ''));
    } else {
        this.isBare = null;
        this.path = null;
        this.name = null;
    }
    this.head = null;
    this.commitCount = 0;
};

/**
 * Registro do commit.
 * @constructor
 * @param {Git.Commit} commit - Objeto com os dados do commit.
 */
JSONDatabase.CommitRecord = function (commit) {
    if (commit != null) {
        this.id = commit.sha();
        this.message = commit.message();
        this.date = commit.date();
        this.snapshotId = commit.treeId().toString();
        this.parents = [];
        var parentsOid = commit.parents();
        parentsOid.forEach(oid => this.parents.push(oid.toString()));
    } else {
        this.id = null;
        this.message = null;
        this.date = null;
        this.snapshotId = null;
        this.parents = [];
    }
    this.authorEmail = null;
};

/**
 * Registro do diff.
 * @constructor
 */
JSONDatabase.DiffRecord = function () {
    this.oldCommitId = null;
    this.recentCommitId = null;
    this.rootDirId = null;
};

/**
 * Registro do autor.
 * @param {Git.Signature} authorSign
 * @constructor
 */
JSONDatabase.AuthorRecord = function (authorSign) {
    if (authorSign != null) {
        this.name = authorSign.name();
        this.email = authorSign.email();
    } else {
        this.name = null;
        this.email = null;
    }
};

JSONDatabase.Statistic = function (added, deleted, modified) {
    this.added = added || 0;
    this.deleted = deleted || 0;
    this.modified = modified || 0;
};

JSONDatabase.Statistic.prototype.add = function (another) {
    this.added += another.added;
    this.deleted += another.deleted;
    this.modified += another.modified;
};

JSONDatabase.Statistic.prototype.greater = function (another) {
    this.added = this.added > another.added ? this.added : another.added;
    this.deleted = this.deleted > another.deleted ? this.deleted : another.deleted;
    this.modified = this.modified > another.modified ? this.modified : another.modified;
};

/**
 * Registro do tipo de entrada para o diretório.
 * @constructor
 * @param {JSONDatabase.ENTRYTYPE} type - Tipo de entrada (diretório ou arquivo).
 */
JSONDatabase.EntryRecord = function (type) {
    this.id = null;
    this.name = null;
    this.path = null;
    this.status = -1;
    this.statistic = null;
    this.type = type;
};

JSONDatabase.EntryRecord.prototype.isFile = function () {
    return this.type === JSONDatabase.ENTRYTYPE.FILE;
};

JSONDatabase.EntryRecord.prototype.isDirectory = function () {
    return this.type === JSONDatabase.ENTRYTYPE.DIRECTORY;
};

JSONDatabase.EntryRecord.prototype.isSubmodule = function () {
    return this.type === JSONDatabase.ENTRYTYPE.SUBMODULE;
};

JSONDatabase.EntryRecord.prototype.isAdded = function () {
    return this.status === JSONDatabase.STATUS.ADDED;
};

JSONDatabase.EntryRecord.prototype.isDeleted = function () {
    return this.status === JSONDatabase.STATUS.DELETED;
};

JSONDatabase.EntryRecord.prototype.isModified = function () {
    return this.status === JSONDatabase.STATUS.MODIFIED;
};

JSONDatabase.EntryRecord.prototype.isUnmodified = function () {
    return this.status === JSONDatabase.STATUS.UNMODIFIED;
};

JSONDatabase.EntryRecord.prototype.isMoved = function () {
    return this.status === JSONDatabase.STATUS.MOVED;
};

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
    blockRec.newLines = newLines;
    blockRec.oldLines = oldLines;
    if (status === JSONDatabase.STATUS.ADDED) {
        this.statistic.added += newLines.length;
    } else if (status === JSONDatabase.STATUS.DELETED) {
        this.statistic.deleted += oldLines.length;
    } else {
        console.assert(status === JSONDatabase.STATUS.MODIFIED, '[JSONDatabase.FileRecord#addBlock] Error: Unknown status passed.');
        this.statistic.modified += oldLines.length;
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
