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
    let foundCommit = this.findCommit(commitRec.id);
    if (foundCommit == undefined) {
        this.commits.push(commitRec);
        this.saved = false;
        return true;
    } else return false;
};

JSONDatabase.prototype.findCommit = function (commitId) {
    return this.commits.find((commit) => commit.id === commitId);
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
    let foundDiff = this.findDiff(diffRec.idCommit1, diffRec.idCommit2);
    if (foundDiff == undefined) {
        this.diffs.push(diffRec);
        this.saved = false;
        return true;
    } else return false;
};

JSONDatabase.prototype.findDiff = function (oldCommitId, recentCommitId) {
    return this.diffs.find((diff) =>
        diff.oldCommitId === oldCommitId && diff.recentCommitId === recentCommitId);
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
    let foundAuthor = this.findAuthor(authorRec.email);
    if (foundAuthor == undefined) {
        this.authors.push(authorRec);
        this.saved = false;
        return true;
    } else return false;
};

JSONDatabase.prototype.findAuthor = function (authorEmail) {
    return this.authors.find((author) => author.email === authorEmail);
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
    return this.dirs.find((dir) => dir.id === directoryId);
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
    let foundFile = this.findFile(fileRec.id);
    if (foundFile == undefined) {
        this.files.push(fileRec);
        this.saved = false;
        return true;
    } else return false;
};

JSONDatabase.prototype.findFile = function (fileId) {
    return this.files.find((file) => file.id === fileId);
};

JSONDatabase.prototype.deleteFile = function (fileId) {
    let foundFile = this.findFile(fileId);
    if (foundFile != undefined) {
        this.files.splice(this.files.indexOf(foundFile), 1);
        this.saved = false;
        return foundFile;
    } else return null;
};

//-------------------------------- Records --------------------------------
/**
 * Registro do repositório.
 * @constructor
 * @param {NodeGit.Repository} repository - Objeto com os dados do repositório.
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
};

/**
 * Registro do commit.
 * @constructor
 * @param {NodeGit.Commit} commit - Objeto com os dados do commit.
 */
JSONDatabase.CommitRecord = function (commit) {
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
 * @param {NodeGit.Signature} authorSign
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

/**
 * Registro do tipo de entrada para o diretório.
 * @constructor
 * @param {JSONDatabase.DIFFENTRYTYPE} type - Tipo de entrada (diretório ou arquivo).
 */
JSONDatabase.DiffEntryRecord = function (type) {
    this.id = null;
    this.name = null;
    this.path = null;
    this.type = type;
};

/**
 * Registro do diff diretório.
 * @constructor
 */
JSONDatabase.DiffDirectoryRecord = function () {
    JSONDatabase.DiffEntryRecord.call(this, JSONDatabase.DIFFENTRYTYPE.DIRECTORY);
    this.entries = [];
};
JSONDatabase.DiffDirectoryRecord.prototype = Object.create(JSONDatabase.DiffEntryRecord.prototype);
JSONDatabase.DiffDirectoryRecord.constructor = JSONDatabase.DiffDirectoryRecord;

/**
 * Registro do diff arquivo.
 * @constructor
 */
JSONDatabase.DiffFileRecord = function () {
    JSONDatabase.DiffEntryRecord.call(this, JSONDatabase.DIFFENTRYTYPE.FILE);
    this.oldFileId = null;
    this.status = -1;
    this.modifiedLines = [];
};
JSONDatabase.DiffFileRecord.prototype = Object.create(JSONDatabase.DiffEntryRecord.prototype);
JSONDatabase.DiffFileRecord.constructor = JSONDatabase.DiffFileRecord;

/**
 * Registro da diff linha.
 * @constructor
 */
JSONDatabase.DiffLineRecord = function () {
    this.oldLineNum = -1;
    this.newLineNum = -1;
    this.status = -1;
};

/**
 * Tipo de entrada para diff diretório.
 * @enum
 */
JSONDatabase.DIFFENTRYTYPE = {
    FILE: 0,
    DIRECTORY: 1
};

/**
 * Status do diff arquivo.
 * @enum
 */
JSONDatabase.DIFFFILESTATUS = {
    ADDED: 0,
    DELETED: 1,
    MODIFIED: 2,
    MOVED: 3
};

/**
 * Status da diff linha.
 * @enum
 */
JSONDatabase.DIFFLINESTATUS = {
    ADDED: 0,
    DELETED: 1,
    MODIFIED: 2
};

module.exports = JSONDatabase;
