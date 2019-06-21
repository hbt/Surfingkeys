var express = require('express');
var app = express();


// Routes
app.get('/moveRight', function(req, res) {
    require('child_process').execSync( ('python /home/hassen/config/scripts/private/bin/my-wm.py move2'))
    res.send('ok')
});

// Listen
var port = process.env.PORT || 3058;
app.listen(port);
console.log('Listening on localhost:'+ port);
