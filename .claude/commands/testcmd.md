Launch a subagent to generate tests for each of the following commands.

The subagent should:

- Read test files in `tests/cdp/commands/cmd-scroll-down.test.ts` and `tests/cdp/commands/cmd-tab-previous.test.ts` as they are good examples of working tests, with CDP testing.
- Should review the implementation and behavior of the command in question before writing the test. 
- Use `dbg test-run` to run tests and notice the results are in json with full filepath for details (like console logs, assertions, coverage etc.) The coverage in the json provides debugging, tracing and profiling information and is faster than any writing console.log and running tests repeatedly. 


The subagent should:

- NOT use waits/timeouts/sleeps with arbitrary numbers unless absolutely necessary to avoid flakiness. It should use callbacks, event driven architecture, polling etc. to increase tests robustness
- NOT use fallbacks and other methods to simply get the test to pass. false positives are worse than failing tests. 



Common gotchas/issues about the architecture and writing tests:

- console.log not showing up because the test doesn't attach to the CDP target.
- stale CDP connections
- attaching to the wrong target (frontend.html, content script, background etc.) 
- attaching to a different tab than the one the test is running on.
- not checking the shadow dom.
- common timing issues like not waiting for the page to load, page to be ready, elements to be present etc.
- relying on console.log instead of assertions for debugging.
- not using the test-run command to run tests or inspecting the detailed json output (view the referenced files in the json stdout)
- believing there is something wrong with the testing infrastructure or source code instead of the test itself and going on a goose chase. 
- knowing how to fix a test but stopping short of actually fixing it and prompting the user to do it or to run the test.




