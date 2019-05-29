#!/bin/bash

cd $(git rev-parse --show-toplevel)
./node_modules/gulp/bin/gulp.js build
cp dist/Chrome-extension/content_scripts/common_content.min.js content_scripts/common_content.min.js 

# restore file -- changes due to fork
git checkout docs/API.md
