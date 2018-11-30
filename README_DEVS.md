# Manual Install 

```bash

git clone git@github.com:hbt/Surfingkeys.git
npm install

# builds the extension for all browsers in dist folder
./node_modules/gulp/bin/gulp.js

```


# Development without gulp and easy reloading of extension in browser upon changes

```

# generates the common_content_min in content_scripts -- needed as some locations (e.g pages/options.html) refer to it in script
# TODO 
./node_modules/gulp/bin/gulp.js generate_common_content_min


```

