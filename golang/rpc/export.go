package rpc

import (
	"errors"
	"fmt"
	"reflect"
)

func MustExport(v interface{}) Handler {
	h, err := Export(v)
	if err != nil {
		panic(err)
	}
	return h
}

func Export(v interface{}) (Handler, error) {
	rt := reflect.TypeOf(v)
	if rt.Kind() == reflect.Func {
		return exportFunc(v, nil)
	}
	return exportStruct(rt, v)
}

func exportStruct(t reflect.Type, rcvr interface{}) (Handler, error) {
	handlers := make(map[string]Handler)
	for i := 0; i < t.NumMethod(); i++ {
		method := t.Method(i)
		handler, err := exportFunc(method.Func.Interface(), rcvr)
		if err != nil {
			return nil, fmt.Errorf("unable to export method %s: %s", method.Name, err.Error())
		}
		handlers[method.Name] = handler
	}

	return HandlerFunc(func(r Responder, c *Call) {
		handler, ok := handlers[c.Method]
		if !ok {
			r.Return(errors.New("method handler does not exist for this destination"))
			return
		}
		handler.RespondRPC(r, c)
	}), nil
}

func exportFunc(fn interface{}, rcvr interface{}) (Handler, error) {
	rfn := reflect.ValueOf(fn)
	rt := reflect.TypeOf(fn)

	if rt.Kind() != reflect.Func {
		return nil, fmt.Errorf("takes only a function")
	}

	var params []reflect.Value
	if rcvr != nil {
		if rt.NumIn() == 0 {
			return nil, fmt.Errorf("expecting 1 receiver argument, got 0")
		}
		params = append(params, reflect.ValueOf(rcvr))
	}

	if rt.NumOut() > 2 {
		return nil, fmt.Errorf("expecting 1 return value and optional error, got >2")
	}

	var pt reflect.Type
	if rt.NumIn() > len(params)+1 {
		pt = reflect.TypeOf([]interface{}{})
	}
	if rt.NumIn() == len(params)+1 {
		pt = rt.In(len(params))
	}

	errorInterface := reflect.TypeOf((*error)(nil)).Elem()

	return HandlerFunc(func(r Responder, c *Call) {
		if pt != nil {
			var pv reflect.Value
			if pt.Kind() == reflect.Ptr {
				pv = reflect.New(pt.Elem())
			} else {
				pv = reflect.New(pt)
			}

			err := c.Decode(pv.Interface())
			if err != nil {
				// arguments weren't what was expected,
				// or any other error
				panic(err)
			}

			switch pt.Kind() {
			case reflect.Slice:
				startIdx := len(params)
				for idx, arg := range reflect.Indirect(pv).Interface().([]interface{}) {
					if rt.In(startIdx+idx).Kind() == reflect.Int {
						params = append(params, reflect.ValueOf(int(arg.(float64))))
					} else {
						params = append(params, reflect.ValueOf(arg))
					}
				}
			case reflect.Ptr:
				params = append(params, pv)
			default:
				params = append(params, pv.Elem())
			}
		}

		retVals := rfn.Call(params)

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
