#!/usr/bin/env bash

shopt -s expand_aliases
alias reccat='~/code/bash/0recursive_cat_with_filenames.sh'
x="$@"
IFS=$'\n' y=($x)
echo "y:"
echo "$y"
for item in "$y"
do
	echo $item
	#reccat "$item" >> tmptmp
done
cat tmptmp | wl-copy
rm tmptmp
