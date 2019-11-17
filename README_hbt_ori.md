original branch with minimal changes to build from original repo

BUILD:

- git fetch --all
- git checkout ori
- git merge brookhong/master
- npm ci 
- npx gulp
- load from dist/chrome...


