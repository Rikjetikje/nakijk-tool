#!/bin/sh
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
cd /Users/rikpols/Documents/Claude/nakijk-tool
exec /usr/local/bin/node node_modules/.bin/vite --host
