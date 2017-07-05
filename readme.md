# Irrelon Appcore
A very lightweight application dependency manager for maintaining clean modularised code.

# Usage
## Include in HEAD
```html
<script type="text/javascript" src="./index.js"></script>
```

Once included, AppCore exposes itself via window.appCore.

## Define Modules
```js
appCore.module('myFirst', function () {
  var MyFirstModule = function () {};
  
  MyFirstModule.prototype.hello = function () {
    console.log('Hello!');
  };
  
  return MyFirstModule;
});
```

When defining modules, you can include the other modules as dependencies by adding them to the function arguments e.g.:

```js
appCore.module('mySecondModule', function (MyFirstModule) {
  var firstModule = new MyFirstModule();
  firstModule.hello(); // Logs "Hello!"
});
```

## Module Return Values
Modules can return anything. In the example above we have returned an object prototype that then gets instantiated in MySecondModule but it could have been any value.

## Singletons
Module functions are only executed ONCE, after all the module's dependencies are resolved. This means you can return an instantiated object if you wish, and further dependecies will use the originally instantiated object rather than creating a new one each time the dependency is requested. Internally we simply store the return value from the module's function and hand that value to any request for the module in the future.

# License
MIT license. Fully free open-source, no copy-left, no nonsense. Use it how you like. Power to the people.

# Questions, Bugs, Comments, Requests?
Please use the github issue tracker for any communications. Do not email me. If you ask something publically then everyone can get the benefit of the response.
