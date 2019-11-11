
// bg-base utils{{{
// ┌───────────────┐
// │ bg-base utils │
// └───────────────┘


/**
 * Return array paraments of a function
 * @param  {[function]} func function
 * @return {[array]}      parammeters the functions
 * https://github.com/padymkoclab/nodejs-utils/blob/master/utils/functools.js
 */
const getFunctionParameters = func => {
	if (typeof func !== 'function') {
		throw new Error('A argument is not function.');
	}
	const args = func.toString().match(/\((.*)\)/)[1];
	return args.split(',').map(arg => {
		if (arg.indexOf('=') === -1) return arg.trim();
		return arg
			.split('=')
			.map(val => val.trim())
			.join(' = ');
	});
};

function filterInternalMethods(method) {
	let internalMethods = [ 'constructor', 'listMethods', 'describe', '__defineGetter__', '__defineSetter__', 'hasOwnProperty', '__lookupGetter__', '__lookupSetter__', 'isPrototypeOf', 'propertyIsEnumerable', 'toString', 'valueOf', 'toLocaleString' ];
  // remove explicit internal methods ↑ and those denoated by `__` prefix.
	return !internalMethods.includes(method) && !method.startsWith('__');
}

function getComments(fn) {
  let functionString = fn.toString();
  let comments = functionString.match(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm);
  if (comments) {
      return comments.map(s => s
        .replace('//', '')
        .replace('/*','')
        .replace('*/','')
        .trim()
      );
  } else {
    return ["No description."];
  }
}

const capitalize = (s) => {
  if (typeof s !== 'string') return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const fromCamelCase = (str, separator = ' ') =>
  capitalize(str
    .replace(/([a-z\d])([A-Z])/g, '$1' + separator + '$2')
    .replace(/([A-Z]+)([A-Z][a-z\d]+)/g, '$1' + separator + '$2')
    .toLowerCase());

//}}}

class BgBase {
    constructor() {
        console.log("bg base constructor called");
        this.registerListeners();
    }

    listMethods() {
      let properties = new Set();
      let obj = this;
      let currentObj = obj;
      do {
        Object.getOwnPropertyNames(currentObj).map(item => properties.add(item));
      } while ((currentObj = Object.getPrototypeOf(currentObj)));

      return [...properties.keys()]
        .filter( item => typeof obj[item] === 'function')
        .filter(filterInternalMethods);
    }

    describe() {
      let methods = this.listMethods();
      return methods.map(method => ({
        name: method,
        displayName: fromCamelCase(method),
        description: getComments(this[method])[0],
        args: getFunctionParameters(this[method])
      }));
    }

    registerListeners() {//{{{
        console.log("register listeners called");
        chrome.runtime.onMessage.addListener((_message, _sender, _sendResponse, _port) => {
            this.handlePortMessage(_message, _sender, _sendResponse, _port);
        });

        chrome.runtime.onConnect.addListener(port => {
            port.onMessage.addListener((message, port) => {
                return this.handlePortMessage(
                    message,
                    port.sender,
                    function(resp) {
                        try {
                            if (!port.isDisconnected) {
                                port.postMessage(resp);
                            }
                        } catch (e) {
                            console.error(message.action + ": " + e);
                            console.error(port, e);
                        }
                    },
                    port
                );
            });
        });
    }//}}}

    handlePortMessage(_message, _sender, _sendResponse, _port) {//{{{
        if (_message && _message.target !== "content_runtime") {
            if (this[_message.action] instanceof Function) {
                try {
                    this[_message.action](_message, _sender, _sendResponse);
                } catch (e) {
                    console.log(_message.action + ": " + e);
                    console.error(e);
                }
            }
        }
    }//}}}

    sendResponse(message, sendResponse, result) {
        result.action = message.action;
        result.id = message.id;
        sendResponse(result);
    }
}
