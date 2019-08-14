.PHONY: bindings

all: build/libmux.dylib bindings

bindings: build/libmux.dylib
	make -C bindings/node

build/libmux.dylib:
	go build -o ./build/libmux.dylib -buildmode=c-shared ./libmux.go