
const modulo = (dividend, divisor) => {
  return ((dividend % divisor) + divisor) % divisor;
};

const getMethods = (obj) => {
  let properties = new Set();
  let currentObj = obj;
  do {
    Object.getOwnPropertyNames(currentObj).map(item => properties.add(item));
  } while ((currentObj = Object.getPrototypeOf(currentObj)));
  return [...properties.keys()].filter(item => typeof obj[item] === 'function');
};



class Window extends BgBase {

  constructor() {
    super();
    this.focusedWindows = [];
    // console.log("win-tab-utils constructor called");
  }

  __addFocusedWindow(winID) {
    this.focusedWindows.push(winID);

// console.log('added this.focusedWindows:', this.focusedWindows);
  }
  __removeFocusedWindow() {
    this.focusedWindows.shift();
    // console.log('removed this.focusedWindows:', this.focusedWindows);
  }


  async allTabsCurrentWindow(_message, _sender, _sendResponse) {
    let tabs = await chrome.tabs.query({currentWindow: true});;
    this.sendResponse(_message, _sendResponse, { data: tabs, count: tabs.length });
  }


  __closeTabs(tabs) {
    for (const tab of tabs) {
      if (tab.active === false) {
        chrome.tabs.remove(tab.id);
      }
    }
  }




	detachTab() {
    // Move current tab into a new window
		chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
			const [tab] = tabs;
			const pinned = tab.pinned;
			chrome.windows.create({ tabId: tab.id }, (window) => {
				chrome.tabs.update(tab.id, { pinned });
			});
		});
	}

	attachTab() {
    // Merge current tab into the last-active window
		chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
			let [tab] = tabs;
			let pinned = tab.pinned;
      let lastWin = this.focusedWindows[this.focusedWindows.length - 2];
			chrome.tabs.query({ windowId: lastWin  }, (tabs) => {
				const target = tabs.find((tab) => tab.active);
				chrome.tabs.move(tab.id, { windowId: target.windowId, index: modulo(target.index + 1, tabs.length + 1) }, (tab) => {
					chrome.tabs.update(tab.id, { pinned });
				});
			});
		});
	}

//{{{

	restoreTab() {
		chrome.sessions.restore();
	}

	duplicateTab(mesgage, sender, sendResponse) {
    chrome.tabs.duplicate(sender.tab.id);
	}

	closeOtherTabs() {
		chrome.tabs.query({ currentWindow: true }, this.__closeTabs);
	}

	closeRightTabs () {
		chrome.tabs.query({ currentWindow: true }, (tabs) => {
			const active = tabs.find((tab) => tab.active);
			const rightTabs = tabs.slice(active.index + 1);
      this.__closeTabs(rightTabs);
		});
	}


	moveTabRight(count = 1) {
		chrome.tabs.query({ currentWindow: true }, (tabs) => {
			const active = tabs.find((tab) => tab.active);
			const next = tabs[modulo(active.index + count, tabs.length)];
			chrome.tabs.move(active.id, { index: next.index });
		});
	}

	moveTabLeft(count = 1) {
		moveTabRight(-count);
	}

	moveTabFirst() {
		chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
			const [tab] = tabs;
			chrome.tabs.move(tab.id, { index: 0 });
		});
	}

	moveTabLast() {
		chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
			const [tab] = tabs;
			chrome.tabs.move(tab.id, { index: -1 });
		});
	}


	muteTab() {
		chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
			const [tab] = tabs;
			chrome.tabs.update(tab.id, { muted: ! tab.mutedInfo.muted });
		});
	}


	muteAllTabs () {
		this.muted = !this.muted;
		chrome.tabs.query({}, (tabs) => {
			for (const tab of tabs) {
				chrome.tabs.update(tab.id, { muted });
			}
		});
	}

	// Pin tabs

	pinTab() {
		chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
			const [tab] = tabs;
			chrome.tabs.update(tab.id, { pinned: ! tab.pinned });
		});
	}
//}}}
}


{
  let ww = new Window();

  chrome.windows.onFocusChanged.addListener((id) => {
    if (id !== chrome.windows.WINDOW_ID_NONE) {
      ww.__addFocusedWindow(id);
    }
    if (ww.focusedWindows.length > 2) {
      ww.__removeFocusedWindow();
    }
  });

  console.log(ww.describe());

}

