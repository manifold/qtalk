TSC := ./node_modules/.bin/tsc
BROWSERIFY := ./node_modules/.bin/browserify
UGLIFY := ./node_modules/.bin/uglifyjs

build: browser node

node_modules:
	yarn

browser: node_modules
	$(TSC) -p tsconfig.browser.json
	$(BROWSERIFY) --s qmux dist/browser/qmux.js dist/browser/qmux_browser.js > ./dist/browser/qmux.min.js
	#$(UGLIFY) > ./dist/browser/qmux.min.js
	rm dist/browser/qmux.js dist/browser/qmux_browser.js

node: node_modules 
	$(TSC) -p tsconfig.node.json