#!/usr/bin/env bash

kill -9 $(lsof -t -i:3058)
node server/app.js &
