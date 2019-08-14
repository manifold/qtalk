package qrpc

import (
	"errors"
	"fmt"
	"reflect"
)

func Must(h Handler, err error) Handler {
	if err != nil {
		panic(err)
	}
	return h
}

func Export(v interface{}) (Handler, error) {
	reflectedType := reflect.TypeOf(v)
	if reflectedType.Kind() == reflect.Func {
		return exportFunc(v, nil)
	}

	methodHandlers := make(map[string]Handler)
	for i := 0; i < reflectedType.NumMethod(); i++ {
		rmethod := reflectedType.Method(i)
		handler, err := exportFunc(rmethod.Func.Interface(), v)
		if err != nil {
			return nil, fmt.Errorf("%s: %s", rmethod.Name, err.Error())
		}
		methodHandlers[rmethod.Name] = handler
	}
	return HandlerFunc(func(r Responder, c *Call) {
		handler, ok := methodHandlers[c.Method]
		if !ok {
			r.Return(errors.New("method handler does not exist for this destination"))
			return
		}
		handler.ServeRPC(r, c)
	}), nil
}

func exportFunc(fn interface{}, rcvr interface{}) (Handler, error) {
	reflectedFn := reflect.ValueOf(fn)

	reflectedType := reflect.TypeOf(fn)
	if reflectedType.Kind() != reflect.Func {
		return nil, fmt.Errorf("takes only a function")
	}
	var hasParam bool
	if rcvr != nil {
		if reflectedType.NumIn() > 2 {
			return nil, fmt.Errorf("only supports 1 argument atm, got %d", reflectedType.NumIn())
		}
		hasParam = reflectedType.NumIn() > 1
	} else {
		if reflectedType.NumIn() > 1 {
			return nil, fmt.Errorf("only supports 1 argument atm, got %d", reflectedType.NumIn())
		}
		hasParam = reflectedType.NumIn() > 0
	}
	if reflectedType.NumOut() > 2 {
		return nil, fmt.Errorf("only supports up to 1 return value and optional error")
	}

	var paramType reflect.Type
	if hasParam {
		if rcvr != nil {
			paramType = reflectedType.In(1)
		} else {
			paramType = reflectedType.In(0)
		}
	} else {
		var empty interface{}
		paramType = reflect.TypeOf(empty)
	}
	errorInterface := reflect.TypeOf((*error)(nil)).Elem()

	return HandlerFunc(func(r Responder, c *Call) {
		var paramValue reflect.Value
		if hasParam {
			if paramType.Kind() == reflect.Ptr {
				paramValue = reflect.New(paramType.Elem())
			} else {
				paramValue = reflect.New(paramType)
			}

			err := c.Decode(paramValue.Interface())
			if err != nil {
				// arguments weren't what was expected,
				// or any other error
				panic(err)
			}
		}

		var params []reflect.Value
		if rcvr != nil {
			params = append(params, reflect.ValueOf(rcvr))
		}
		if hasParam {
			if paramType.Kind() == reflect.Ptr {
				params = append(params, paramValue)
			} else {
				params = append(params, paramValue.Elem())
			}
		}
		retVals := reflectedFn.Call(params)

		if len(retVals) == 0 {
			r.Return(nil)
			return
		}

		// assuming up to 2 return values, one being an error
		var retVal reflect.Value
		for _, v := range retVals {
			if v.Type().Implements(errorInterface) {
				if !v.IsNil() {
					r.Return(v.Interface().(error))
					return
				}
			} else {
				retVal = v
			}
		}
		r.Return(retVal.Interface())

	}), nil
}
