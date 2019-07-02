var express = require('express');
var app = express();


// Routes
app.get('/moveRight', function (req, res) {
    require('child_process').execSync(('python /home/hassen/config/scripts/private/bin/my-wm.py move2'))
    res.send('ok')
});

// Routes
app.get('/restoreWindow', function (req, res) {
    let command = '/home/hassen/config/scripts/private/bin/my-wm-save-window.php';
    const cmd = require('child_process').spawn(command, ['restore', req.query.id])

    // cmd.on('error', err => {
    //     console.log(err)
    // })
    //
    // if (cmd.stdout) {
    //     cmd.stdout.on('data', v => {
    //         console.log(v.toString())
    //     })
    // }
    //
    // if (cmd.stderr) {
    //     cmd.stderr.on('data', v => {
    //         console.log(v.toString())
    //     })
    // }

    res.send('ok')
});


// Routes
app.get('/saveWindow', function (req, res) {
    let command = '/home/hassen/config/scripts/private/bin/my-wm-save-window.php';
    const cmd = require('child_process').spawn(command, ['save', req.query.id])

    // cmd.on('error', err => {
    //     console.log(err)
    // })
    //
    // if (cmd.stdout) {
    //     cmd.stdout.on('data', v => {
    //         console.log(v.toString())
    //     })
    // }
    //
    // if (cmd.stderr) {
    //     cmd.stderr.on('data', v => {
    //         console.log(v.toString())
    //     })
    // }

    res.send('ok')
});

// Listen
var port = process.env.PORT || 3058;
app.listen(port);
console.log('Listening on localhost:' + port);
