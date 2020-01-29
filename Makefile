
link: javascript/qrpc/node_modules javascript/qmux/node_modules
	cd javascript/qmux && yarn link
	cd javascript/qrpc && yarn link

javascript/qmux/node_modules:
	cd javascript/qmux && yarn install

javascript/qrpc/node_modules:
	cd javascript/qrpc && yarn install

