
## What would it take to migrate to mozilla's browser polyfill?
  https://github.com/mozilla/webextension-polyfill

  lusakasa/saka-key uses this approach. See commit:
  https://github.com/lusakasa/saka-key/commit/d29293c76b68c49c97f0a983774c27e16990f5c1


## Chrome extension hot reload
  https://medium.com/@xpl/hot-reloading-for-chrome-extensions-3da296916286
  https://60devs.com/hot-reloading-for-chrome-extensions.html
  https://github.com/xpl/crx-hotreload

  This method seems too good to be true, honestly.

  "hot-reload.js"


### Alternatives to hot-reload.js
  - https://github.com/rubenspgcavalcante/webpack-chrome-extension-reloader
  - https://github.com/samuelsimoes/chrome-extension-webpack-boilerplate


  **Old method from Solomon Victorino**
  https://blog.solomonvictorino.com/reloading-unpacked-chrome-extensions-on-save-from-anywhere/

  This method requires adding a chrome extension and a gulp task.

  ```sh
  git clone https://github.com/JeromeDane/chrome-extension-auto-reload
  cd chrome-extension-auto-reload
  npm install
  npm audit fix
  npm run build
  ```

  ```javascript
  var gulp = require('gulp');;
  var watch = require('gulp-watch');
  var io = require('socket.io');

  gulp.task('chrome-watch', function () {
       var WEB_SOCKET_PORT = 8890;
       io = io.listen(WEB_SOCKET_PORT);
       watch('**/*.*', function(file) {
         console.log('change detected', file.relative);
         io.emit('file.change', {});
       });
  });
  ```
