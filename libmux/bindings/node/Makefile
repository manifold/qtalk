.PHONY: test

all: libmux.js

node_modules:
	yarn

libmux.js: node_modules
	./node_modules/.bin/tsc --lib es2015 libmux.ts

test:
	npm test