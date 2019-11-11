#!/bin/bash

cd /tmp || exit

# rm existing
date=$(date "+%s")
folder="tmp-$date"
mv Surfingkeys "$folder"


# clone
git clone git@github.com:hbt/Surfingkeys.git
cd Surfingkeys || exit

git remote add brookhong git@github.com:brookhong/Surfingkeys.git

git fetch brookhong master
git merge brookhong/master
