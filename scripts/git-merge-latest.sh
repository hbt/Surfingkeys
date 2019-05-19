#!/bin/bash

cd /tmp

# rm existing
date=`date "+%s"`
folder="tmp-$date"
mv Surfingkeys $folder


# clone
git clone git@github.com:hbt/Surfingkeys.git
cd Surfingkeys

git remote add brookhong git@github.com:brookhong/Surfingkeys.git

git fetch brookhong master
git merge brookhong/master