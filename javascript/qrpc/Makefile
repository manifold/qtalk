TSC := ./node_modules/.bin/tsc
BROWSERIFY := ./node_modules/.bin/browserify
UGLIFY := ./node_modules/.bin/uglifyjs

build: browser node

node_modules:
	yarn	

browser: node_modules
	$(TSC) -p tsconfig.browser.json
	$(BROWSERIFY) --s qrpc dist/browser/qrpc.js | $(UGLIFY) > ./dist/browser/qrpc.min.js
	#rm dist/browser/qmux.js dist/browser/qmux_browser.js

node: node_modules 
	$(TSC) -p tsconfig.node.json
