const path = require('path');
const fs = require('fs');

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
    this.saved = true;
    fs.mkdir(this.rootPath, (err) => {});
}

JSONDatabase.prototype.saveToDisk = function () {
    fs.writeFile(this.rootPath + path.sep + 'repository.json', JSON.stringify(this.repository, null, 4), (err) => {
        if (err) console.error('Error:', err);
    });
    fs.writeFile(this.rootPath + path.sep + 'commits.json', JSON.stringify(this.commits, null, 4), (err) => {
        if (err) console.error('Error:', err);
    });
    fs.writeFile(this.rootPath + path.sep + 'diffs.json', JSON.stringify(this.diffs, null, 4), (err) => {
        if (err) console.error('Error:', err);
    });
    fs.writeFile(this.rootPath + path.sep + 'authors.json', JSON.stringify(this.authors, null, 4), (err) => {
        if (err) console.error('Error:', err);
    });
    fs.writeFile(this.rootPath + path.sep + 'dirs.json', JSON.stringify(this.dirs, null, 4), (err) => {
        if (err) console.error('Error:', err);
    });
    fs.writeFile(this.rootPath + path.sep + 'files.json', JSON.stringify(this.files, null, 4), (err) => {
        if (err) console.error('Error:', err);
    });
    this.saved = true;
};

JSONDatabase.prototype.recoverFromDisk = function () {
    fs.readFile(this.rootPath + path.sep + 'repository.json', 'utf8', (err, repositoryJson) => {
        if (err) console.error('Error:', err);
        this.repository = JSON.parse(repositoryJson);
    });
    fs.readFileSync(this.rootPath + path.sep + 'commits.json', 'utf8', (err, commitsJson) => {
        if (err) console.error('Error:', err);
        this.commits = JSON.parse(commitsJson);
    });
    fs.readFileSync(this.rootPath + path.sep + 'diffs.json', 'utf8', (err, diffsJson) => {
        if (err) console.error('Error:', err);
        this.diffs = JSON.parse(diffsJson);
    });
    fs.readFileSync(this.rootPath + path.sep + 'authors.json', 'utf8', (err, authorsJson) => {
        if (err) console.error('Error:', err);
        this.authors = JSON.parse(authorsJson);
    });
    fs.readFile(this.rootPath + path.sep + 'dirs.json', 'utf8', (err, dirsJson) => {
        if (err) console.error('Error:', err);
        this.dirs = JSON.parse(dirsJson);
    });
    fs.readFile(this.rootPath + path.sep + 'files.json', 'utf8', (err, filesJson) => {
        if (err) console.error('Error:', err);
        this.files = JSON.parse(filesJson);
    });
    this.saved = true;
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

JSONDatabase.prototype.getRepository = function () {
    return this.repository;
};

JSONDatabase.prototype.addCommit = function (commitRec) {
    let foundCommit = this.commits.find((commit) => commit.id === commitRec.id);
    if (foundCommit == undefined) {
        this.commits.push(commitRec);
        this.saved = false;
        return true;
    } else return false;
};

JSONDatabase.prototype.deleteCommit = function (commitId) {
    let foundCommit = this.commits.find((commit) => commit.id === commitId);
    if (foundCommit != undefined) {
        this.commits.splice(this.commits.indexOf(foundCommit), 1);
        this.saved = false;
        return foundCommit;
    } else return null;
};

JSONDatabase.prototype.addDiff = function (diffRec) {
    let foundDiff = this.diffs.find((diff) => diff.id === diffRec.id);
    if (foundDiff == undefined) {
        this.diffs.push(diffRec);
        this.saved = false;
        return true;
    } else return false;
};

// TODO: Use commits id (composited primaryKey) to remove diff record.
JSONDatabase.prototype.deleteDiff = function (diffId) {
    let foundDiff = this.diffs.find((diff) => diff.id === diffId);
    if (foundDiff != undefined) {
        this.diffs.splice(this.diffs.indexOf(foundDiff), 1);
        this.saved = false;
        return foundDiff;
    } else return null;
};

JSONDatabase.prototype.addAuthor = function (authorRec) {
    let foundAuthor = this.authors.find((author) => author.email === authorRec.email);
    if (foundAuthor == undefined) {
        this.authors.push(authorRec);
        this.saved = false;
        return true;
    } else return false;
};

JSONDatabase.prototype.deleteAuthor = function (authorEmail) {
    let foundAuthor = this.authors.find((author) => author.email === authorEmail);
    if (foundAuthor != undefined) {
        this.authors.splice(this.authors.indexOf(foundAuthor), 1);
        this.saved = false;
        return foundAuthor;
    } else return null;
};

JSONDatabase.prototype.addDirectory = function (directoryRec) {
    let foundDir = this.dirs.find((dir) => dir.id === directoryRec.id);
    if (foundDir == undefined) {
        this.dirs.push(directoryRec);
        this.saved = false;
        return true;
    } else return false;
};

JSONDatabase.prototype.findDirectory = function (directoryId) {
    let foundDir = this.dirs.find((dir) => dir.id === directoryId);
    return foundDir;
};

JSONDatabase.prototype.deleteDirectory = function (directoryId) {
    let foundDir = this.dirs.find((dir) => dir.id === directoryId);
    if (foundDir != undefined) {
        this.dirs.splice(this.dirs.indexOf(foundDir), 1);
        this.saved = false;
        return foundDir;
    } else return null;
};

JSONDatabase.prototype.addFile = function (fileRec) {
    let foundFile = this.files.find((file) => file.id === fileRec.id);
    if (foundFile == undefined) {
        this.files.push(fileRec);
        this.saved = false;
        return true;
    } else return false;
};

JSONDatabase.prototype.deleteFile = function (fileId) {
    let foundFile = this.files.find((file) => file.id === fileId);
    if (foundFile != undefined) {
        this.files.splice(this.files.indexOf(foundFile), 1);
        this.saved = false;
        return foundFile;
    } else return null;
};

/**
 * Registro do repositório.
 * @param {NodeGit.Repository} repository - Objeto com os dados do repositório.
 */
JSONDatabase.prototype.RepositoryRecord = function (repository) {
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
};

/**
 * Registro do commit.
 * @param {NodeGit.Commit} commit - Objeto com os dados do commit.
 */
JSONDatabase.prototype.CommitRecord = function (commit) {
    if (commit != null) {
        this.id = commit.sha();
        this.message = commit.message();
        this.date = commit.date();
        this.snapshotId = commit.treeId().toString();
        this.patches = [];
        this.parents = [];
        var parentsOid = commit.parents();
        parentsOid.forEach((oid) => this.parents.push(oid.toString()));
    } else {
        this.id = null;
        this.message = null;
        this.date = null;
        this.snapshotId = null;
        this.patches = [];
        this.parents = [];
    }
};

JSONDatabase.prototype.DiffRecord = function () {
    this.idCommit1 = null;
    this.idCommit2 = null;
    this.idRootDir = null;
};

/**
 * Registro do autor.
 * @param {NodeGit.Signature} authorSign
 */
JSONDatabase.prototype.AuthorRecord = function (authorSign) {
    if (authorSign != null) {
        this.name = authorSign.name();
        this.email = authorSign.email();
    } else {
        this.name = null;
        this.email = null;
    }
};

/**
 * Registro do tipo de entrada para o diretório.
 * @param {JSONDatabase.ENTRYTYPE} type
 */
JSONDatabase.prototype.EntryRecord = function (type) {
    this.id = null;
    this.name = null;
    this.path = null;
    this.type = type;
};

JSONDatabase.prototype.DirectoryRecord = function () {
    JSONDatabase.prototype.EntryJSONDatabase.call(this, JSONDatabase.ENTRYTYPE.DIRECTORY);
    this.entries = [];
};
JSONDatabase.prototype.DirectoryJSONDatabase.prototype = Object.create(JSONDatabase.prototype.EntryJSONDatabase.prototype);
JSONDatabase.prototype.DirectoryJSONDatabase.constructor = JSONDatabase.prototype.DirectoryRecord;

JSONDatabase.prototype.FileRecord = function () {
    JSONDatabase.prototype.EntryJSONDatabase.call(this, JSONDatabase.ENTRYTYPE.FILE);
    this.idOldFile = null;
    this.status = -1;
    this.modifiedLines = [];
};
JSONDatabase.prototype.FileJSONDatabase.prototype = Object.create(JSONDatabase.prototype.EntryJSONDatabase.prototype);
JSONDatabase.prototype.FileJSONDatabase.constructor = JSONDatabase.prototype.FileRecord;

JSONDatabase.prototype.LineRecord = function () {
    this.oldLineNum = -1;
    this.newLineNum = -1;
    this.status = -1;
};

JSONDatabase.prototype.ENTRYTYPE = {
    FILE: 0,
    DIRECTORY: 1
};

JSONDatabase.prototype.FILESTATUS = {
    ADDED: 0,
    DELETED: 1,
    MODIFIED: 2,
    MOVED: 3
};

JSONDatabase.prototype.LINESTATUS = {
    ADDED: 0,
    DELETED: 1,
    MODIFIED: 2
};

module.exports = JSONDatabase;
