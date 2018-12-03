# Manual Install 

```bash

git clone git@github.com:hbt/Surfingkeys.git
npm install

# builds the extension for all browsers in dist folder
./node_modules/gulp/bin/gulp.js

# copy from dist/Chrome-extension/content_scripts/common_content.min.js to content_scripts/common_content.min.js
cp dist/Chrome-extension/content_scripts/common_content.min.js content_scripts/common_content.min.js

```


# TODO 
# Development without gulp and easy reloading of extension in browser upon changes

```

# generates the common_content_min in content_scripts -- needed as some locations (e.g pages/options.html) refer to it in script
./node_modules/gulp/bin/gulp.js generate_common_content_min


```

