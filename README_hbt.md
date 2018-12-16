# Fork notes

## Manual Install 

```bash

git clone git@github.com:hbt/Surfingkeys.git
npm install

# build minified file used in html files -- mostly html files that i dont use/care about. necessary in case of major changes
# core file is frontend.html and uses raw scripts instead of minified
./scripts/build-contents-min-and-copy.sh


```

Load extension from root folder instead of dist/....
ONLY tested on chrome.


## Config example

view [Surfingkeys/surfingskeysrc-config-example.js at master · hbt/Surfingkeys](https://github.com/hbt/Surfingkeys/blob/master/surfingskeysrc-config-example.js)


## Merge latest

Code is isolated as much as possible to avoid conflicts between merges.

```bash

gcm
g co -b dev
g fetch --all
g m brookhong/master
# ctrl+g reload and check for errors

# if all goes well. Merge into master

gcm
g m brookhong/master
g b -D dev

```

## Notes

* config path is /home/hassen/.surfingkeysrc
* uses https://bitbucket.org/hbt/bookmarks-editor project for load/dump bookmarks 
* uses https://github.com/hbt/mouseless python server for gvim stuff
* uses https://github.com/hbt/chrome-restore-focus to fix focus when lost in browser without having to touch mouse
* uses https://github.com/hbt/chromedotfiles for toggleDomainStylesheet stuff
* the config file is loaded every time -- even in JS apps if a tab update event is detected
* Use console > preserve log when coding in config file as the log gets eaten by frontend.html
* avoid changes to core extension files  to prevent code conflicts. If needed, Work around it (separate files/namespaces) + identify changes (hbtXXX) to ease conflict resolution + encapsulate (call a method, no inline code)

