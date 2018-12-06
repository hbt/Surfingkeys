var CustomCommands = (function() {
    let self = {};

    self.testMyPort = async () => {
        return await aruntime({ action: "testMyPort" });
    };

    async function aruntime(obj) {
        return new Promise(resolve => {
            runtime.command(obj, resolve);
        });
    }

    self.copyTopURL = () => {
        runtime.command(
            {
                action: "copyTopURL"
            },
            function(res) {
                Front.showBanner(res.url);
            }
        );
    };

    self.copyRootURL = async () => {
        const res = await aruntime({ action: "copyTopURL" });
        Front.showBanner(res.url);
    };

    self.openLinkIncognito = function(url) {
        runtime.command(
            {
                action: "openLinkIncognito",
                url: url
            },
            function(res) {}
        );
    };

    self.passSingleKey = function() {
        PassThrough.enter();
        PassThrough.addEventListener("keydown", function(event) {
            event.sk_suppressed = true;
            PassThrough.exit();
        });
    };

    return self;
})();
