
build: qtalk.bundle.js

qtalk.bundle.js:
	deno bundle -c tsconfig.json ./qtalk.ts qtalk.bundle.js
	cp qtalk.bundle.js ../_examples/webview/qtalk.bundle.js
	test -f ../../studio/ui/lib/vnd/qtalk.bundle.js && cp qtalk.bundle.js ../../studio/ui/lib/vnd/qtalk.bundle.js

clean:
	rm qtalk.bundle.js || true