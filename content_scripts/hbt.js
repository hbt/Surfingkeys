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
        RUNTIME('copyRootURL')
    };

    return self;
})();
