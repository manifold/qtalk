
build: qtalk.bundle.js

qtalk.bundle.js:
	deno bundle -c tsconfig.json ./qtalk.ts qtalk.bundle.js
	cp qtalk.bundle.js ../_examples/webview/qtalk.bundle.js
	# for tractor, when qtalk is checked out under tractor
	@test -f ../../vnd/qtalk/qtalk.bundle.js && cp qtalk.bundle.js ../../vnd/qtalk/qtalk.bundle.js || true

clean:
	rm qtalk.bundle.js || true