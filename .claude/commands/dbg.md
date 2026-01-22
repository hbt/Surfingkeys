use bin/dbg --help

run dbg errors-list

Focus on one error at the time unless you notice a common pattern between them all.

investigate each error by first gathering context using file + line number in dist /home/hassen/workspace/surfingkeys/dist/development

then find corresponding code in src/ 

then investigating root cause.
attempt to reproduce using 'bin/sk-cdp' 

suggest a fix but don't implement and wait for user confirmation. 


