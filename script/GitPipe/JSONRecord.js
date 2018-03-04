
export class RepositoryRecord {
    /**
     * @param {Git.Repository} repository A nodegit repository object.
     */
    constructor(repository) {
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
    }
}

export class CommitRecord {
    /**
     * @param {Git.Commit} commit A nodegit commit object.
     */
    constructor(commit) {
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
    }
}

export class DiffRecord {
    consctructor() {
        this.oldCommitId = null;
        this.recentCommitId = null;
        this.rootDirId = null;
    }
}

export class AuthorRecord {
    /**
     * @param {Git.Signature} authorSign A author signature.
     */
    constructor(authorSign) {
        if (authorSign != null) {
            this.name = authorSign.name();
            this.email = authorSign.email();
        } else {
            this.name = null;
            this.email = null;
        }
    }
}

export class Statistic {
    constructor(added, deleted, modified) {
        this.added = added || 0;
        this.deleted = deleted || 0;
        this.modified = modified || 0;
    }
    add(another) {
        this.added += another.added;
        this.deleted += another.deleted;
        this.modified += another.modified;
    }
    greater(another) {
        this.added = this.added > another.added ? this.added : another.added;
        this.deleted = this.deleted > another.deleted ? this.deleted : another.deleted;
        this.modified = this.modified > another.modified ? this.modified : another.modified;
    }
}

export class EntryRecord {
    /**
     * @param {JSONDatabase.ENTRYTYPE} type The entry type.
     */
    constructor(type) {
        this.id = null;
        this.name = null;
        this.path = null;
        this.status = -1;
        this.statistic = null;
        this.type = type;
    }
    isFile() {
        return this.type === JSONDatabase.ENTRYTYPE.FILE;
    }
    isDirectory() {
        return this.type === JSONDatabase.ENTRYTYPE.DIRECTORY;
    }
    isSubmodule() {
        return this.type === JSONDatabase.ENTRYTYPE.SUBMODULE;
    }
    isAdded() {
        return this.status === JSONDatabase.STATUS.ADDED;
    }
    isDeleted() {
        return this.status === JSONDatabase.STATUS.DELETED;
    }
    isModified() {
        return this.status === JSONDatabase.STATUS.MODIFIED;
    }
    isUnmodified() {
        return this.status === JSONDatabase.STATUS.UNMODIFIED;
    }
    isMoved() {
        return this.status === JSONDatabase.STATUS.MOVED;
    }
}
