var CustomCommands = (function() {
    let self = {};

    self.testMyPort = cb => {
        runtime.command(
            {
                action: "testMyPort"
            },
            cb
        );
    };

    self.copyTopURL = () => {
        runtime.command(
            {
                action: "copyTopURL"
            },
            function(res) {
                Front.showBanner(res.url)
            }
        );
    };

    return self;
})();
