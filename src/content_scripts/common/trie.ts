/*
 *  A simple implementation of Trie by brook hong, for less memory usage and better performance.
 *
 *  Each node has at most two properties, stem or meta. All other properties are expected to be
 *  one character, taken to be child of the node.
 *
 */

interface TrieMeta {
    word: string;
    [key: string]: unknown;
}

interface TrieInstance {
    stem?: string;
    meta?: TrieMeta;
    find(word: string): TrieInstance | undefined;
    add(word: string, meta: TrieMeta): void;
    remove(word: string): TrieInstance | undefined;
    getWords(prefix?: string, withoutStem?: boolean): string[];
    getMetas(criterion: (meta: TrieMeta) => boolean): TrieMeta[];
    getPrefixWord(): string;
    [key: string]: unknown;
}

function Trie(this: TrieInstance) {
    if (arguments.length > 0) {
        this.stem = arguments[0] as string;
    }
    if (arguments.length > 1) {
        this.meta = arguments[1] as TrieMeta;
    }
}

Trie.prototype = {
    find: function(word: string) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        var found: TrieInstance | undefined = this;
        const len = word.length;
        for (var i = 0; i < len && found; i++) {
            found = found[word[i]] as TrieInstance | undefined;
        }
        return found;
    },

    add: function(word: string, meta: TrieMeta) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        var node: TrieInstance = this;
        const len = word.length;
        for (var i = 0; i < len; i++) {
            var c = word[i];
            if (!node.hasOwnProperty(c)) {
                // @ts-expect-error -- constructor function used with new at runtime
                var t = new Trie(c) as TrieInstance;
                node[c] = t;
                node = t;
            } else {
                node = node[c] as TrieInstance;
            }
        }

        meta.word = word;
        node.meta = meta;
    },

    remove: function(word: string) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        var found: TrieInstance | undefined = this;
        const len = word.length;
        const ancestor: TrieInstance[] = [];
        for (var i = 0; i < len && found; i++) {
            // keep node in path for later to remove empty nodes
            ancestor.push(found);
            found = found[word[i]] as TrieInstance | undefined;
        }
        if (found) {
            var i = ancestor.length - 1,
                node = ancestor[i];
            delete node[found.stem!];
            var parent = node;
            while (parent !== this && Object.keys(parent).length === 1) {
                // remove the node if it has only one property -- which should be stem
                node = ancestor[--i];
                delete node[parent.stem!];
                parent = node;
            }
        }
        return found;
    },

    getWords: function(prefix: string, withoutStem: boolean) {
        var ret: string[] = [], prefix = (prefix || "") + (withoutStem ? "" : (this.stem || ""));
        if (this.hasOwnProperty('meta')) {
            ret.push(prefix);
        }
        for (var k in this) {
            if (k.length === 1) {
                ret = ret.concat((this[k] as TrieInstance).getWords(prefix));
            }
        }
        return ret;
    },

    getMetas: function(criterion: (meta: TrieMeta) => boolean) {
        var ret: TrieMeta[] = [];
        if (this.hasOwnProperty('meta') && criterion(this.meta as TrieMeta)) {
            ret.push(this.meta as TrieMeta);
        }
        for (var k in this) {
            if (k.length === 1) {
                ret = ret.concat((this[k] as TrieInstance).getMetas(criterion));
            }
        }
        return ret;
    },

    getPrefixWord: function() {
        // unmapAllExcept could make this Trie object empty.
        if (Object.keys(this).length === 0) {
            return "";
        }
        var fullWord = "";
        var futureWord = this.stem;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        var node: TrieInstance = this;
        while (fullWord === "") {
            var keys = Object.keys(node);
            for (var i = 0; i < keys.length; i++) {
                if (keys[i] === 'meta') {
                    fullWord = (node.meta as TrieMeta).word;
                    break;
                } else if (keys[i] !== 'stem') {
                    futureWord = futureWord + keys[i];
                    node = node[keys[i]] as TrieInstance;
                    break;
                }
            }
        }
        return fullWord.substr(0, fullWord.length - futureWord!.length + 1);
    }
};

export default Trie;
