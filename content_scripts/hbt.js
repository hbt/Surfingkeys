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

    // TODO(hbt) NEXT
    self.copyTopURL = () => {
        // mapkey('yy', "#7Copy current page's URL", function() {
        //     Clipboard.write(window.location.href);
        // });
    };

    return self;
})();

