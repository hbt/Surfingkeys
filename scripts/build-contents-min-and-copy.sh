#!/bin/bash

cd $(git rev-parse --show-toplevel)
./node_modules/gulp/bin/gulp.js build
rm content_scripts/common_content.min.js &> /dev/null
rm content_scripts/modules.min.js &> /dev/null
cp -v dist/Chrome-extension/content_scripts/modules.min.js content_scripts/modules.min.js 

# restore file -- changes due to fork
git checkout docs/API.md
