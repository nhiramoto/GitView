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
    console.log('< saveToDisk()');
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
    return this.commits;
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
    return this.diffs.find(diff =>
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

/**
 * Pesquisa por um diretório ou arquivo na base de dados.
 * @param {String} entryId - Chave de pesquisa.
 * @return {JSONDatabase.EntryRecord} O diretório ou arquivo encontrado,
 *  undefined caso não encontre.
 */
JSONDatabase.prototype.findEntry = function (entryId) {
    console.log('findEntry(id = ' + entryId + ')');
    let result = this.findDirectory(entryId);
    if (result == undefined) return this.findFile(entryId);
    else return result;
};

/**
 * Constrói a hierarquia de diretórios a partir do diretório
 *  com rootId correspondente.
 * @param {String} rootId - Chave do diretório raiz.
 */
JSONDatabase.prototype.hierarchize = function (rootId) {
    let root = this.findEntry(rootId);
    console.log('root:', root);
    console.assert(root != undefined, 'JSONDatabase#hierarchize: Error - Entry not found (loose id).');
    if (root.isDirectory()) {
        let entriesId = root.entriesId;
        root.entries = [];
        entriesId.forEach(entryId => {
            console.assert(typeof(entryId) === 'string', '[JSONDatabase#hierarchize] Error: Entry id is not a id.');
            let entry = this.hierarchize(entryId);
            root.entries.push(entry);
        });
    }
    return root;
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
    } else if (dir1.isFile() || dir2.isFile()) {
        console.error('[JSONDatabase#mergeDirectories] Error: Cannot merge files.');
        return null;
    } else if (dir1.entries == undefined || dir2.entries == undefined) {
        console.error('[JSONDatabase#mergeDirectories] Error: The directories must be hierarchized.');
    } else {
        if (dir1.name.trim() === dir2.name.trim()) {
            let mergedDir = new JSONDatabase.DirectoryRecord();
            let toMergeDir1 = dir1.entries.filter(e1 => e1.isDirectory() && dir2.entries.map(e2 => e2.name).includes(e1.name));
            let toMergeDir2 = dir2.entries.filter(e2 => e2.isDirectory() && toMergeDir1.map(e1 => e1.name).includes(e2.name));
            mergedDir.id = dir1.id + ':' + dir2.id;
            mergedDir.name = dir1.name;
            mergedDir.path = dir2.path;
            mergedDir.statistic = new JSONDatabase.Statistic(dir1.added + dir2.added, dir1.deleted + dir2.deleted, dir1.modified + dir2.modified);
            mergedDir.entries = dir1.entries.filter(e1 => !toMergeDir1.includes(e1)).concat(dir2.entries.filter(e2 => !toMergeDir2.includes(e2)));
            toMergeDir1.forEach(e1 => {
                let e2 = toMergeDir2.find(v => v.name === e1.name);
                let mergedEntries = this.mergeDirectories(e1, e2);
                console.assert(e1.isDirectory() && e2.isDirectory(), '[JSONDatabase#mergeDirectories] Error: Entries is not directories.');
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

/**
 * Registro do tipo de entrada para o diretório.
 * @constructor
 * @param {JSONDatabase.ENTRYTYPE} type - Tipo de entrada (diretório ou arquivo).
 */
JSONDatabase.EntryRecord = function (type) {
    this.id = null;
    this.name = null;
    this.path = null;
    this.statistic = null;
    this.type = type;
};

JSONDatabase.EntryRecord.prototype.isFile = function () {
    return this.type === JSONDatabase.ENTRYTYPE.FILE;
};

JSONDatabase.EntryRecord.prototype.isDirectory = function () {
    return this.type === JSONDatabase.ENTRYTYPE.DIRECTORY;
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
    this.oldFileId = null;
    this.status = -1;
    this.blocks = [];
    this.lastBlockIndex = -1;
};
JSONDatabase.FileRecord.prototype = Object.create(JSONDatabase.EntryRecord.prototype);
JSONDatabase.FileRecord.constructor = JSONDatabase.FileRecord;

/**
 * Registro do bloco do arquivo, com as linhas que foram modificadas.
 *
 */
JSONDatabase.BlockRecord = function () {
    this.index = -1;
    this.status = -1;
    this.newLines = [];
    this.oldLines = [];
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
    DIRECTORY: 1
};

JSONDatabase.STATUS = {
    ADDED: 0,
    DELETED: 1,
    MODIFIED: 2,
    UNMODIFIED: 3,
    MOVED: 4
};

module.exports = JSONDatabase;
