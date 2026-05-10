/*
 *  A simple implementation of Trie by brook hong, for less memory usage and better performance.
 *
 *  Each node has at most two properties, stem or meta. All other properties are expected to be
 *  one character, taken to be child of the node.
 *
 */

export interface TrieMeta {
    word: string;
    [key: string]: unknown;
}

interface TrieNode {
    stem?: string;
    meta?: TrieMeta;
    [char: string]: TrieNode | TrieMeta | string | undefined;
}

class Trie implements TrieNode {
    stem?: string;
    meta?: TrieMeta;
    [char: string]: Trie | TrieMeta | string | undefined;

    constructor(stem?: string, meta?: TrieMeta) {
        if (stem !== undefined) {
            this.stem = stem;
        }
        if (meta !== undefined) {
            this.meta = meta;
        }
    }

    find(word: string): Trie | undefined {
        let found: Trie | undefined = this;
        const len = word.length;
        for (let i = 0; i < len && found; i++) {
            found = found[word[i]] as Trie | undefined;
        }
        return found;
    }

    add(word: string, meta: Omit<TrieMeta, 'word'> & Partial<Pick<TrieMeta, 'word'>>): void {
        let node: Trie = this;
        const len = word.length;
        for (let i = 0; i < len; i++) {
            const c = word[i];
            if (!Object.prototype.hasOwnProperty.call(node, c)) {
                const t = new Trie(c);
                node[c] = t;
                node = t;
            } else {
                node = node[c] as Trie;
            }
        }

        (meta as TrieMeta).word = word;
        node.meta = meta as TrieMeta;
    }

    remove(word: string): Trie | undefined {
        let found: Trie | undefined = this;
        const len = word.length;
        const ancestor: Trie[] = [];
        for (let i = 0; i < len && found; i++) {
            // keep node in path for later to remove empty nodes
            ancestor.push(found);
            found = found[word[i]] as Trie | undefined;
        }
        if (found) {
            let i = ancestor.length - 1;
            let node = ancestor[i];
            delete node[found.stem!];
            let parent = node;
            while (parent !== this && Object.keys(parent).length === 1) {
                // remove the node if it has only one property -- which should be stem
                node = ancestor[--i];
                delete node[parent.stem!];
                parent = node;
            }
        }
        return found;
    }

    getWords(prefix?: string, withoutStem?: boolean): string[] {
        let ret: string[] = [];
        const currentPrefix = (prefix || "") + (withoutStem ? "" : (this.stem || ""));
        if (Object.prototype.hasOwnProperty.call(this, 'meta')) {
            ret.push(currentPrefix);
        }
        for (const k in this) {
            if (k.length === 1) {
                ret = ret.concat((this[k] as Trie).getWords(currentPrefix));
            }
        }
        return ret;
    }

    getMetas(criterion: (meta: TrieMeta) => boolean): TrieMeta[] {
        let ret: TrieMeta[] = [];
        if (Object.prototype.hasOwnProperty.call(this, 'meta') && criterion(this.meta!)) {
            ret.push(this.meta!);
        }
        for (const k in this) {
            if (k.length === 1) {
                ret = ret.concat((this[k] as Trie).getMetas(criterion));
            }
        }
        return ret;
    }

    getPrefixWord(): string {
        // unmapAllExcept could make this Trie object empty.
        if (Object.keys(this).length === 0) {
            return "";
        }
        let fullWord = "";
        let futureWord = this.stem;
        let node: Trie = this;
        while (fullWord === "") {
            const keys = Object.keys(node);
            for (let i = 0; i < keys.length; i++) {
                if (keys[i] === 'meta') {
                    fullWord = node.meta!.word;
                    break;
                } else if (keys[i] !== 'stem') {
                    futureWord = (futureWord || "") + keys[i];
                    node = node[keys[i]] as Trie;
                    break;
                }
            }
        }
        return fullWord.substr(0, fullWord.length - (futureWord || "").length + 1);
    }
}

export default Trie;
