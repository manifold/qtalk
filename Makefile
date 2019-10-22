
link: qrpc/node/node_modules qmux/node/node_modules
	cd qmux/node && yarn link
	cd qrpc/node && yarn link

qmux/node/node_modules:
	cd qmux/node && yarn install

qrpc/node/node_modules:
	cd qrpc/node && yarn install

