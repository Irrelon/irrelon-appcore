(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
/**
 * Irrelon AppCore
 *
 * A very lightweight application dependency manager for maintaining
 * clean modularised code without polluting the global namespace.
 *
 * https://github.com/Irrelon/irrelon-appcore
 * npm install irrelon-appcore
 *
 * License: MIT
 * Copyright 2016 Irrelon Software Limited
 * https://www.irrelon.com
 */
"use strict";

var singelton;
var AppCoreModule = _dereq_('./AppCoreModule');
var Emitter = _dereq_('irrelon-emitter');

/**
 * The main application class that ties all the application
 * modules together and exposes the appCore to the global scope
 * via window.appCore.
 * @exports AppCore
 * @constructor
 */
var AppCore = function () {
	// Determine the environment we are executing in
	this.isServer = (typeof(module) !== 'undefined' && typeof(module.exports) !== 'undefined' && typeof window === 'undefined');
	this.isClient = !this.isServer;
	
	// The object that holds references to all the app's
	// modules that are defined by appCore.module().
	this._modules = {};
	this._moduleDefs = {};
	this._config = [];
	this._run = [];
	this.data = {};
	
	// The object that holds a reference to callbacks that
	// are waiting for a module to become available / loaded
	this._waiting = {};
	
	// Set a log level so we only show warnings (2) and errors (1)
	// level 3 and 4 are info - lots of console spamming
	this._logLevel = 2;
	
	console.log('----------------------------------------------');
	console.log('| Powered by Irrelon AppCore                 |');
	console.log('| (C)opyright ' + new Date().getFullYear() + ' Irrelon Software Limited  |');
	console.log('| https://github.com/irrelon/irrelon-appcore |');
	console.log('----------------------------------------------');
};

Emitter(AppCore);

/**
 * Gets / sets the logging level that AppCore will use to explain
 * what it is doing. Lower levels (1 and 2) are error and warnings,
 * higher levels (up to 4) are info. Setting to 4 is asking for all
 * levels 4 and below.
 * @param {Number=} newLevel If provided, sets the new logging level.
 * @returns {*}
 */
AppCore.prototype.logLevel = function (newLevel) {
	if (newLevel !== undefined) {
		this._logLevel = newLevel;
		return this;
	}
	
	return this._logLevel;
};

/**
 * Gets / registers a module with the application.
 * @param {String} moduleName The name of the module to define.
 * @param {Function=} controllerDefinition Optional. The function to
 * assign as the module's controller. If omitted we will return the module
 * specified by the "name" argument if it exists.
 * @returns {Function|AppCore} If "moduleDefinition" is provided, returns
 * "this" to allow chaining. If "moduleDefinition" is omitted,
 * returns the module specified by the "name" argument.
 */
AppCore.prototype.module = function (moduleName, controllerDefinition) {
	var module;
	
	if (!controllerDefinition) {
		module = this._modules[moduleName];
		
		if (!module) {
			throw('Module with name "' + moduleName + '" not defined!');
		}
		
		return this._modules[moduleName];
	}
	
	this._modules[moduleName] = new AppCoreModule(this, moduleName);
	
	if (controllerDefinition) {
		this._modules[moduleName].controller(controllerDefinition);
	}
	
	// Now inform any waiting dependants that this module is here
	this._moduleLoaded(moduleName);
	
	// Allow chaining
	return this._modules[moduleName];
};

/**
 * Scans a function definition for dependencies and waits for those
 * dependencies to become available, then calls back to the waiting
 * code with the controller return data for each dependency.
 * @param {String} dependantName The dependant module name (the one
 * waiting for the dependencies to become available).
 * @param {Function} definition The function with optional arguments
 * that represent dependencies to inject.
 * @param {Function} callback The callback function to call once all
 * the dependencies are available.
 * @returns {AppCore}
 * @private
 */
AppCore.prototype._getDependencies = function (dependantName, definition, callback) {
	var moduleDeps,
		moduleDepsArr,
		depArgumentArr = [],
		dependenciesSatisfied = 0,
		gotDependency,
		depIndex,
		depTimeout = [];
	
	if (!definition) {
		throw('No function provided to AppCoreModule._getDependencies()!');
	}
	
	// Convert dependency list to an array
	moduleDeps = this._dependencyList(definition);
	moduleDepsArr = moduleDeps.arr;
	
	// Check if the module has dependencies
	if (!moduleDepsArr.length) {
		// No dependencies were found
		if (this._logLevel >= 4) { console.log('AppCore: ' + dependantName + ': Has no dependencies'); }
		
		// We have our dependencies, send them back
		callback(false, depArgumentArr);
		return this;
	}
	
	// Grab the dependencies we need - this is a really simple way
	// to check we got our dependencies by how many times this function
	// gets called.
	gotDependency = function (dependencyName, dependency) {
		var depArgumentIndex;
		
		dependenciesSatisfied++;
		
		// Check which index this dependency should be in
		depArgumentIndex = moduleDepsArr.indexOf(dependencyName);
		
		// Clear the timeout for the dependency
		clearTimeout(depTimeout[depArgumentIndex]);
		depTimeout[depArgumentIndex] = 0;
		
		// Assign the dependency to the correct argument index
		depArgumentArr[depArgumentIndex] = dependency;
		
		// Check if we have all the dependencies we need
		if (dependenciesSatisfied === moduleDepsArr.length) {
			// We have our dependencies, send them back
			return callback(false, depArgumentArr);
		}
	};
	
	// Register our dependency handler for each dependency
	if (this._logLevel >= 4) { console.log('AppCore: ' + dependantName + ': Getting dependencies', moduleDepsArr); }
	for (depIndex = 0; depIndex < moduleDepsArr.length; depIndex++) {
		// Create a timeout that will cause a browser error if we are
		// waiting too long for a dependency to arrive
		depTimeout[depIndex] = setTimeout(this.generateDependencyTimeout(dependantName, moduleDepsArr[depIndex]), 3000);
		
		// Now ask to wait for the module
		this._waitForModule(dependantName, moduleDepsArr[depIndex], gotDependency);
	}
	
	return this;
};

/**
 * Gets an array of dependency names.
 * @param {Function} definition The function to get dependency
 * names for.
 * @returns {{arr: Array, name: *}}
 * @private
 */
AppCore.prototype._dependencyList = function (definition) {
	var moduleString,
		moduleDeps,
		moduleDepsArr = [],
		moduleRegExp = /^function(.*?)\((.*?)\)/gi;
	
	// Handle array style
	if (definition instanceof Array) {
		// We have been given a list of dependencies already
		moduleDepsArr = definition.slice(0, definition.length - 1);
		moduleString = definition[definition.length - 1].toString();
		
		// Loop the array and remove any undefined's
		while (moduleDepsArr.indexOf(undefined) > -1) {
			moduleDepsArr.splice(moduleDepsArr.indexOf(undefined), 1);
		}
		
		moduleString = moduleString
			.replace(/\n/g, '')
			.replace(/\r/g, '')
			.replace(/\t/g, '');
		
		moduleDeps = moduleRegExp.exec(moduleString);
		
		if (moduleDeps && moduleDeps.length) {
			// Clean the function name and dependency list by removing whitespace
			moduleDeps[1] = moduleDeps[1].replace(/ /gi, '');
			moduleDeps[2] = moduleDeps[2].replace(/ /gi, '');
		}
	} else {
		// Stringify the module function
		moduleString = definition.toString();
		moduleString = moduleString
			.replace(/\n/g, '')
			.replace(/\r/g, '')
			.replace(/\t/g, '');
		
		// Scan module function string to extract dependencies
		// via the regular expression. The dependencies this module
		// has will be a string in the moduleDeps array at index 2
		// if any dependencies were provided.
		moduleDeps = moduleRegExp.exec(moduleString);
		
		if (moduleDeps && moduleDeps.length) {
			// Clean the function name and dependency list by removing whitespace
			moduleDeps[1] = moduleDeps[1].replace(/ /gi, '');
			moduleDeps[2] = moduleDeps[2].replace(/ /gi, '');
			
			if (moduleDeps[2] !== "") {
				// Convert dependency list to an array
				moduleDepsArr = moduleDeps[2].split(',');
			}
		}
	}
	
	return {
		arr: moduleDepsArr,
		name: moduleDeps[1] || moduleDeps[0] || 'anonymous'
	};
};

/**
 * Generates a function that will be called by a timeout when a
 * dependency does not load in the given time.
 * @param {String} moduleName The name of the module that is waiting
 * for a module to load.
 * @param {String} dependencyName The name of the dependency module
 * that we are waiting for.
 * @returns {Function}
 */
AppCore.prototype.generateDependencyTimeout = function (moduleName, dependencyName) {
	var self = this;
	
	return function () {
		if (self._logLevel >= 1) { console.error('AppCore: ' + moduleName + ': Dependency failed to load in time: ' + dependencyName); }
	};
};

/**
 * Adds the passed callback function to an array that will be
 * processed once the named module has loaded.
 * @param {String} dependantName The name of the module waiting
 * for the dependency.
 * @param {String} moduleName The name of the module to wait for.
 * @param {Function} callback The function to call once the
 * named module has loaded.
 * @returns {AppCore} Returns "this" for method chaining.
 * @private
 */
AppCore.prototype._waitForModule = function (dependantName, moduleName, callback) {
	var self = this;
	
	// Check if the module we are waiting for already exists
	if (this._modules[moduleName] !== undefined) {
		if (this._logLevel >= 4) { console.log('AppCore: ' + dependantName + ': Dependency "' + moduleName + '" exists'); }
		// The module is already loaded, ask for it
		this._modules[moduleName].config();
		this._modules[moduleName].controller(undefined, function (err, value) {
			self._modules[moduleName].run();
			if (self._logLevel >= 4) { console.log('AppCore: ' + dependantName + ': Dependency "' + moduleName + '" loaded'); }
			callback(moduleName, value);
		});
		return this;
	}
	
	// Add the callback to the waiting list for this module
	if (this._logLevel >= 4) { console.log('AppCore: ' + dependantName + ': Dependency "' + moduleName + '" does not yet exist'); }
	this._waiting[moduleName] = this._waiting[moduleName] || [];
	this._waiting[moduleName].push(function (moduleName, value) {
		if (self._logLevel >= 4) { console.log('AppCore: ' + dependantName + ': Dependency "' + moduleName + '" now exists'); }
		callback(moduleName, value);
	});
	
	return this;
};

/**
 * Called when a module has loaded and will loop the array of
 * waiting functions that have registered to be called when the
 * named module has loaded, telling them the module is now
 * available to use.
 * @param {String} moduleName The name of the module that has loaded.
 * @private
 */
AppCore.prototype._moduleLoaded = function (moduleName) {
	var self = this,
		waitingArr,
		waitingIndex;
	
	// Tell any modules waiting for this one that we are
	// loaded and ready
	waitingArr = this._waiting[moduleName] || null;
	
	if (!waitingArr || !waitingArr.length) {
		// Nothing is waiting for us, exit
		return;
	}
	
	// Now get the module's controller result by executing it
	if (self._logLevel >= 4) { console.log('AppCore: ' + moduleName + ': ' + waitingArr.length + ' Dependants are waiting for "' + moduleName + '" and it now exists, executing...'); }
	this._modules[moduleName].config();
	this._modules[moduleName].controller(undefined, function (err, value) {
		self._modules[moduleName].run();
		// Loop the waiting array and tell the receiver that
		// this module has loaded
		for (waitingIndex = 0; waitingIndex < waitingArr.length; waitingIndex++) {
			waitingArr[waitingIndex](moduleName, value);
		}
		
		// Clear the waiting array for this module
		delete self._waiting[moduleName];
	});
};

/**
 * Takes an array of functions and waits for each function's
 * dependencies to be resolved and then executes the function.
 * This is done in order, one at a time.
 * @param {Array} arr An array of functions.
 * @param {Function} callback Callback to call when complete.
 * @private
 */
AppCore.prototype._executeQueue = function (arr, callback) {
	var self = this,
		definition,
		nextItem,
		valueArr;
	
	valueArr = [];
	
	nextItem = function () {
		var deps;
		
		definition = arr.shift();
		
		if (!definition) {
			return callback(false, valueArr);
		}
		
		deps = self._dependencyList(definition);
		
		self._getDependencies(deps.name, definition, function (err, argsArr) {
			definition = self._getFinalFunc(definition);
			
			// Execute the item function passing the dependencies
			// and store the return value in the valueArr
			valueArr.push(definition.apply(self, argsArr));
			
			if (arr.length) {
				// Process the next item
				return nextItem();
			}
			
			// All processing finished, callback now
			callback(false, valueArr);
		});
	};
	
	// Now start the processing
	nextItem();
};

/**
 * Config functions are checked for dependencies and run as
 * soon as they are declared.
 * @param definition
 */
AppCore.prototype.config = function (definition, callback) {
	var i;
	
	if (definition) {
		this._config.push(definition);
		return this;
	}
	
	// Execute all config blocks
	this._executeQueue(this._config, function (err, valueArr) {
		if (callback) { callback(err, valueArr); }
	});
	
	return this;
};

/**
 * Run functions are executed once the AppCore is bootstrapped.
 * @param definition
 */
AppCore.prototype.run = function (definition, callback) {
	if (definition) {
		this._run.push(definition);
	}
	
	if (definition && !this._initialised) {
		return this;
	}
	
	this._initialised = true;
	
	// Execute all run blocks
	this._executeQueue(this._run, function (err, valueArr) {
		if (callback) { callback(err, valueArr); }
	});
	
	return this;
};

/**
 * Starts the app core - this defines the entry point into
 * your application by the passed function.
 * @param {Function} definition The function to call to start
 * the application. Will wait for all the function's dependencies
 * to become available before calling it.
 */
AppCore.prototype.bootstrap = function (definition) {
	var self = this,
		deps;
	
	if (self._logLevel >= 4) { console.log('AppCore: Bootstrapping...'); }
	
	// Execute any config blocks
	self.config(undefined, function () {
		// Get the dependencies for the bootstrap function
		deps = self._dependencyList(definition);
		
		self._getDependencies(deps.name, definition, function (err, depArr) {
			definition = self._getFinalFunc(definition);
			
			// Execute any run blocks
			self.run(undefined, function () {
				// Now execute the bootstrap function
				if (self._logLevel >= 4) { console.log('AppCore: Bootstrap complete, executing bootstrap callback...'); }
				definition.apply(definition, depArr);
			});
		});
	});
};

AppCore.prototype.sanityCheck = function () {
	var i,
		moduleDef,
		moduleDefString,
		moduleNameRegExp,
		moduleDeps,
		moduleNamesArr,
		nameIndex,
		moduleName;
	
	// Grab all module names
	moduleNamesArr = Object.keys(this._moduleDefs);
	
	// Loop the modules
	for (i in this._moduleDefs) {
		if (this._moduleDefs.hasOwnProperty(i)) {
			moduleDef = this._moduleDefs[i];
			moduleDefString = moduleDef.toString();
			
			// Clean definition
			moduleDefString = moduleDefString
				.replace(/(\/\*\*[.\s\S]*?\*\/)/g, '')
				.replace(/\/\/[.\s\S]*?$/gm, '');
			
			moduleDeps = this._dependencyList(moduleDef);
			
			// Loop the module names array
			for (nameIndex = 0; nameIndex < moduleNamesArr.length; nameIndex++) {
				moduleName = moduleNamesArr[nameIndex];
				moduleNameRegExp = new RegExp('\\b' + moduleName + '\\b');
				
				if (moduleName.toLowerCase() !== i.toLowerCase() && moduleDeps.arr.indexOf(moduleName) === -1) {
					// Check for module usage without dependency injection
					if (moduleNameRegExp.test(moduleDefString)) {
						console.warn('AppCore: Module "' + i + '" might require un-injected module "' + moduleName + '"');
					}
				}
			}
		}
	}
};

AppCore.prototype._getFinalFunc = function (data) {
	if (data instanceof Array) {
		return data[data.length - 1];
	}
	
	return data;
};

singelton = new AppCore();

// Create the appCore instance and add to global scope
if (typeof module  !== 'undefined' && typeof module.exports !== 'undefined') {
	module.exports = singelton;
}

if (typeof window !== 'undefined') {
	window.appCore = singelton;
}
},{"./AppCoreModule":2,"irrelon-emitter":3}],2:[function(_dereq_,module,exports){
var Emitter = _dereq_('irrelon-emitter');

/**
 * A class that encapsulates a module's lifecycle.
 * @param {AppCore} appCore The AppCore instance that this module
 * belongs to.
 * @param {String} moduleName The module name.
 * @constructor
 */
var AppCoreModule = function (appCore, moduleName) {
	this._appCore = appCore;
	this._moduleName = moduleName;
	this._config = [];
	this._run = [];
	
	this._initialised = false;
	
	if (this._appCore._logLevel >= 4) { console.log('AppCore: ' + this._moduleName + ': Init...'); }
};

Emitter(AppCoreModule);

/**
 * Config functions are checked for dependencies and run as
 * soon as they are declared.
 * @param definition
 */
AppCoreModule.prototype.config = function (definition, callback) {
	if (definition) {
		this._config.push(definition);
		return this;
	}
	
	// Execute all config blocks
	this._appCore._executeQueue(this._config, function (err, valueArr) {
		if (callback) { callback(err, valueArr); }
	});
	
	return this;
};

/**
 * Run functions are executed once the AppCore is bootstrapped.
 * @param definition
 */
AppCoreModule.prototype.run = function (definition, callback) {
	if (definition) {
		this._run.push(definition);
	}
	
	if (definition && !this._initialised) {
		return this;
	}
	
	this._initialised = true;
	
	// Execute all run blocks
	this._appCore._executeQueue(this._run, function (err, valueArr) {
		if (callback) { callback(err, valueArr); }
	});
	
	return this;
};

/**
 * Controller functions are executed as they are requested from
 * a dependency injection. If a controller has already been
 * injected previously then the existing return value is returned
 * unless the controller has been destroyed using module.destroy()
 * in which case it is executed again and its return value stored
 * against it again.
 * @param definition
 */
AppCoreModule.prototype.controller = function (definition, callback) {
	var self = this;
	
	// Check if we were passed a controller function
	if (definition) {
		this._controller = definition;
		if (this._appCore._logLevel >= 4) { console.log('AppCore: ' + this._moduleName + ': Controller defined'); }
		return this;
	}
	
	// Check if we have a pre-cached controller return value
	if (this._value) {
		if (this._appCore._logLevel >= 4) { console.log('AppCore: ' + this._moduleName + ': Returning cached value'); }
		if (callback) { callback(false, self._value); }
		return this._value;
	}
	
	// Resolve dependencies, execute the controller and store the
	// return value
	self._appCore._getDependencies(self._moduleName, self._controller, function (err, argsArr) {
		var definition = self._appCore._getFinalFunc(self._controller);
		
		if (self._appCore._logLevel >= 4) { console.log('AppCore: ' + self._moduleName + ': All dependencies found, executing controller...'); }
		self._value = definition.apply(self, argsArr);
		
		if (self._appCore._logLevel >= 4) { console.log('AppCore: ' + self._moduleName + ': Controller executed'); }
		if (callback) { callback(false, self._value); }
	});
};

/**
 * Destroys a module's cached controller return data which
 * means next time the module is requested the controller will
 * be re-executed.
 */
AppCoreModule.prototype.destroy = function () {
	// Fire destroy event
	this.emit('destroy');
	if (this._appCore._logLevel >= 4) { console.log('AppCore: ' + this._moduleName + ': Destroying controller instance'); }
	delete this._value;
	this._initialised = false;
	if (this._appCore._logLevel >= 4) { console.log('AppCore: ' + this._moduleName + ': Controller instance destroyed'); }
	this.emit('destroyed');
};

module.exports = AppCoreModule;
},{"irrelon-emitter":3}],3:[function(_dereq_,module,exports){
/*
 The MIT License (MIT)

 Copyright (c) 2014 Irrelon Software Limited
 http://www.irrelon.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice, url and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.

 Source: https://github.com/irrelon/emitter

 Changelog:
 	Version 2.0.1:
 		Bug fix in this._emitters usage
 	Version 2.0.0:
 		Big update to bring in line with latest developments in other projects. Event emitter can
 		now use deferEmit(), emitId(), emitStatic(), emitStaticId(), willEmit(), willEmitId().
 	Version 1.1.9:
 		Updated changelog correctly
 	Version 1.1.8:
 		Removed tons of dependencies wrongly included in main dependencies, have moved to devDependencies section of package.json
 	Version 1.1.0:
 		Added support for overloaded methods
 		Added support for events with ids
 	Version 1.0.2:
 		Removed AMD support, added browserify support
 		Added package.json
 		Added once() method
 		Added hasListener() method
 		Published to NPM as irrelon-emitter
 	Version 1.0.1:
 		Added ability to extend any object with eventing capability
 		Added AMD / Require.js support
		 Added Node.js support
	Version 1.0.0:
		First commit
 */
"use strict";

var Overload = _dereq_('irrelon-overload');

var EventMethods = {
	on: new Overload({
		/**
		 * Attach an event listener to the passed event.
		 * @param {String} event The name of the event to listen for.
		 * @param {Function} listener The method to call when the event is fired.
		 */
		'string, function': function (event, listener) {
			return this.$main(event, '*', listener);
		},
		
		/**
		 * Attach an event listener to the passed event only if the passed
		 * id matches the document id for the event being fired.
		 * @param {String} event The name of the event to listen for.
		 * @param {*} id The document id to match against.
		 * @param {Function} listener The method to call when the event is fired.
		 */
		'string, *, function': function (event, id, listener) {
			return this.$main(event, id, listener);
		},
		
		'$main': function (event, id, listener) {
			var self = this,
				generateTimeout,
				emitter,
				i;
			
			generateTimeout = function (emitter) {
				setTimeout(function () {
					listener.apply(self, emitter.args);
				}, 1);
			};
			
			this._listeners = this._listeners || {};
			this._listeners[event] = this._listeners[event] || {};
			this._listeners[event][id] = this._listeners[event][id] || [];
			this._listeners[event][id].push(listener);
			
			// Check for any static emitters, and fire the event if any exist
			if (this._emitters && this._emitters[event] && this._emitters[event].length) {
				// Emit events for each emitter
				for (i = 0; i < this._emitters[event].length; i++) {
					emitter = this._emitters[event];
					
					if (id === '*' || emitter.id === id) {
						// Call the listener out of process so that any code that expects a listener
						// to be called at some point in the future rather than immediately on registration
						// will not fail
						generateTimeout(emitter);
					}
				}
			}
			
			return this;
		}
	}),
	
	once: new Overload({
		/**
		 * Attach an event listener to the passed event which will only fire once.
		 * @param {String} event The name of the event to listen for.
		 * @param {Function} listener The method to call when the event is fired.
		 */
		'string, function': function (event, listener) {
			var self = this,
				fired = false,
				internalCallback = function () {
					if (!fired) {
						fired = true;
						self.off(event, internalCallback);
						listener.apply(self, arguments);
					}
				};
			
			return this.on(event, internalCallback);
		},
		
		/**
		 * Attach an event listener to the passed event only if the passed
		 * id matches the document id for the event being fired.
		 * @param {String} event The name of the event to listen for.
		 * @param {*} id The document id to match against.
		 * @param {Function} listener The method to call when the event is fired.
		 */
		'string, *, function': function (event, id, listener) {
			var self = this,
				fired = false,
				internalCallback = function () {
					if (!fired) {
						fired = true;
						self.off(event, id, internalCallback);
						listener.apply(self, arguments);
					}
				};
			
			return this.on(event, id, internalCallback);
		}
	}),
	
	off: new Overload({
		/**
		 * Cancels all event listeners for the passed event.
		 * @param {String} event The name of the event.
		 * @returns {*}
		 */
		'string': function (event) {
			var self = this;
			
			if (this._emitting) {
				this._eventRemovalQueue = this._eventRemovalQueue || [];
				this._eventRemovalQueue.push(function () {
					self.off(event);
				});
			} else {
				if (this._listeners && this._listeners[event]) {
					delete this._listeners[event];
				}
			}
			
			return this;
		},
		
		/**
		 * Cancels the event listener for the passed event and listener function.
		 * @param {String} event The event to cancel listener for.
		 * @param {Function} listener The event listener function used in the on()
		 * or once() call to cancel.
		 * @returns {*}
		 */
		'string, function': function (event, listener) {
			var self = this,
				arr,
				index;
			
			if (this._emitting) {
				this._eventRemovalQueue = this._eventRemovalQueue || [];
				this._eventRemovalQueue.push(function () {
					self.off(event, listener);
				});
			} else {
				if (typeof(listener) === 'string') {
					if (this._listeners && this._listeners[event] && this._listeners[event][listener]) {
						delete this._listeners[event][listener];
					}
				} else {
					if (this._listeners && this._listeners[event]) {
						arr = this._listeners[event]['*'];
						index = arr.indexOf(listener);
						
						if (index > -1) {
							arr.splice(index, 1);
						}
					}
				}
			}
			
			return this;
		},
		
		/**
		 * Cancels an event listener based on an event name, id and listener function.
		 * @param {String} event The event to cancel listener for.
		 * @param {String} id The ID of the event to cancel listening for.
		 * @param {Function} listener The event listener function used in the on()
		 * or once() call to cancel.
		 */
		'string, *, function': function (event, id, listener) {
			var self = this;
			
			if (this._emitting) {
				this._eventRemovalQueue = this._eventRemovalQueue || [];
				this._eventRemovalQueue.push(function () {
					self.off(event, id, listener);
				});
			} else {
				if (this._listeners && this._listeners[event] && this._listeners[event][id]) {
					var arr = this._listeners[event][id],
						index = arr.indexOf(listener);
					
					if (index > -1) {
						arr.splice(index, 1);
					}
				}
			}
		},
		
		/**
		 * Cancels all listeners for an event based on the passed event name and id.
		 * @param {String} event The event name to cancel listeners for.
		 * @param {*} id The ID to cancel all listeners for.
		 */
		'string, *': function (event, id) {
			var self = this;
			
			if (this._emitting) {
				this._eventRemovalQueue = this._eventRemovalQueue || [];
				this._eventRemovalQueue.push(function () {
					self.off(event, id);
				});
			} else {
				if (this._listeners && this._listeners[event] && this._listeners[event][id]) {
					// Kill all listeners for this event id
					delete this._listeners[event][id];
				}
			}
		}
	}),
	
	emit: new Overload({
		/**
		 * Emit an event.
		 * @param {String} event The event to emit.
		 * @returns {*}
		 */
		'string': function (event) {
			// Fire global listeners
			return this.$main(event);
		},
		
		/**
		 * Emit an event with data.
		 * @param {String} event The event to emit.
		 * @param {*} data Data to emit with the event.
		 * @returns {*}
		 */
		'string, ...': function (event, data) {
			// Fire global listeners first
			this.$main.apply(this, arguments);
			
			return this;
		},
		
		/**
		 * Handles emitting events, is an internal method not called directly.
		 * @param {String} event The name of the event to emit.
		 * @param {*} data The data to emit with the event.
		 * @returns {*}
		 * @private
		 */
		'$main': function (event, data) {
			var id = '*';
			this._listeners = this._listeners || {};
			this._emitting = true;
			
			if (this._listeners[event]) {
				var arrIndex,
					arrCount,
					tmpFunc,
					arr;
				
				// Handle global emit
				if (this._listeners[event][id]) {
					arr = this._listeners[event][id];
					arrCount = arr.length;
					
					for (arrIndex = 0; arrIndex < arrCount; arrIndex++) {
						// Check we have a function to execute
						tmpFunc = arr[arrIndex];
						
						if (typeof tmpFunc === 'function') {
							tmpFunc.apply(this, Array.prototype.slice.call(arguments, 1));
						}
					}
				}
			}
			
			this._emitting = false;
			this._processRemovalQueue();
			
			return this;
		}
	}),
	
	emitId: new Overload({
		'string': function (event) {
			throw('Missing id from emitId call!');
		},
		
		'string, *': function (event, id) {
			return this.$main(event, id);
		},
		
		'string, *, ...': function (event, id) {
			// Fire global listeners first
			this.$main.apply(this, arguments);
			
			return this;
		},
		
		'$main': function (event, id, data) {
			this._listeners = this._listeners || {};
			this._emitting = true;
			
			if (this._listeners[event]) {
				var arrIndex,
					arrCount,
					tmpFunc,
					arr;
				
				// Handle global emit
				if (this._listeners[event]['*']) {
					arr = this._listeners[event]['*'];
					arrCount = arr.length;
					
					for (arrIndex = 0; arrIndex < arrCount; arrIndex++) {
						// Check we have a function to execute
						tmpFunc = arr[arrIndex];
						
						if (typeof tmpFunc === 'function') {
							tmpFunc.apply(this, Array.prototype.slice.call(arguments, 2));
						}
					}
				}
				
				// Handle id emit
				if (this._listeners[event][id]) {
					arr = this._listeners[event][id];
					arrCount = arr.length;
					
					for (arrIndex = 0; arrIndex < arrCount; arrIndex++) {
						// Check we have a function to execute
						tmpFunc = arr[arrIndex];
						
						if (typeof tmpFunc === 'function') {
							tmpFunc.apply(this, Array.prototype.slice.call(arguments, 2));
						}
					}
				}
			}
			
			this._emitting = false;
			this._processRemovalQueue();
			
			return this;
		}
	}),
	
	emitStatic: new Overload({
		/**
		 * Emit an event that will fire on listeners even when the listener
		 * is registered AFTER the event has been emitted.
		 *
		 * @param {String} event The event to emit.
		 * @returns {*}
		 */
		'string': function (event) {
			// Fire global listeners
			return this.$main(event);
		},
		
		/**
		 * Emit an event with data that will fire on listeners even when the listener
		 * is registered AFTER the event has been emitted.
		 *
		 * @param {String} event The event to emit.
		 * @param {*} data Data to emit with the event.
		 * @returns {*}
		 */
		'string, ...': function (event, data) {
			// Fire global listeners first
			this.$main.apply(this, arguments);
			
			return this;
		},
		
		/**
		 * Handles emitting events, is an internal method not called directly.
		 * @param {String} event The name of the event to emit.
		 * @param {*} data The data to emit with the event.
		 * @returns {*}
		 * @private
		 */
		'$main': function (event, data) {
			var id = '*';
			this._listeners = this._listeners || {};
			this._emitting = true;
			
			if (this._listeners[event]) {
				var arrIndex,
					arrCount,
					tmpFunc,
					arr;
				
				// Handle global emit
				if (this._listeners[event][id]) {
					arr = this._listeners[event][id];
					arrCount = arr.length;
					
					for (arrIndex = 0; arrIndex < arrCount; arrIndex++) {
						// Check we have a function to execute
						tmpFunc = arr[arrIndex];
						
						if (typeof tmpFunc === 'function') {
							tmpFunc.apply(this, Array.prototype.slice.call(arguments, 1));
						}
					}
				}
			}
			
			this._emitting = false;
			
			this._emitters = this._emitters || {};
			this._emitters[event] = this._emitters[event] || [];
			this._emitters[event].push({
				id: '*',
				args: Array.prototype.slice.call(arguments, 1)
			});
			
			this._processRemovalQueue();
			
			return this;
		}
	}),
	
	emitStaticId: new Overload({
		/**
		 * Require an id to emit.
		 * @param event
		 */
		'string': function (event) {
			throw('Missing id from emitId call!');
		},
		
		/**
		 * Emit an event that will fire on listeners even when the listener
		 * is registered AFTER the event has been emitted.
		 *
		 * @param {String} event The event to emit.
		 * @param {String} id The id of the event to emit.
		 * @returns {*}
		 */
		'string, *': function (event, id) {
			return this.$main(event, id);
		},
		
		/**
		 * Emit an event that will fire on listeners even when the listener
		 * is registered AFTER the event has been emitted.
		 *
		 * @param {String} event The event to emit.
		 * @param {String} id The id of the event to emit.
		 * @param {*=} data The data to emit with the event.
		 * @returns {*}
		 */
		'string, *, ...': function (event, id, data) {
			// Fire global listeners first
			this.$main.apply(this, arguments);
			
			return this;
		},
		
		/**
		 * Handles emitting events, is an internal method not called directly.
		 * @param {String} event The name of the event to emit.
		 * @param {String} id The id of the event to emit.
		 * @param {*} data The data to emit with the event.
		 * @returns {*}
		 * @private
		 */
		'$main': function (event, id, data) {
			this._listeners = this._listeners || {};
			this._emitting = true;
			
			if (this._listeners[event]) {
				var arrIndex,
					arrCount,
					tmpFunc,
					arr;
				
				// Handle global emit
				if (this._listeners[event]['*']) {
					arr = this._listeners[event]['*'];
					arrCount = arr.length;
					
					for (arrIndex = 0; arrIndex < arrCount; arrIndex++) {
						// Check we have a function to execute
						tmpFunc = arr[arrIndex];
						
						if (typeof tmpFunc === 'function') {
							tmpFunc.apply(this, Array.prototype.slice.call(arguments, 2));
						}
					}
				}
				
				// Handle id emit
				if (this._listeners[event][id]) {
					arr = this._listeners[event][id];
					arrCount = arr.length;
					
					for (arrIndex = 0; arrIndex < arrCount; arrIndex++) {
						// Check we have a function to execute
						tmpFunc = arr[arrIndex];
						
						if (typeof tmpFunc === 'function') {
							tmpFunc.apply(this, Array.prototype.slice.call(arguments, 2));
						}
					}
				}
			}
			
			this._emitting = false;
			
			this._emitters = this._emitters || {};
			this._emitters[event] = this._emitters[event] || [];
			this._emitters[event].push({
				id: id,
				args: Array.prototype.slice.call(arguments, 2)
			});
			
			this._processRemovalQueue();
			
			return this;
		}
	}),
	
	/**
	 * Checks if an event has any event listeners or not.
	 * @param {String} event The name of the event to check for.
	 * @returns {boolean} True if one or more event listeners are registered for
	 * the event. False if none are found.
	 */
	willEmit: function (event) {
		var id = '*';
		
		if (this._listeners && this._listeners[event]) {
			var arrIndex,
				arrCount,
				tmpFunc,
				arr;
			
			// Handle global emit
			if (this._listeners[event][id]) {
				arr = this._listeners[event][id];
				arrCount = arr.length;
				
				for (arrIndex = 0; arrIndex < arrCount; arrIndex++) {
					// Check we have a function to execute
					tmpFunc = arr[arrIndex];
					
					if (typeof tmpFunc === 'function') {
						return true;
					}
				}
			}
		}
		
		return false;
	},
	
	/**
	 * Checks if an event has any event listeners or not based on the passed id.
	 * @param {String} event The name of the event to check for.
	 * @param {String} id The event ID to check for.
	 * @returns {boolean} True if one or more event listeners are registered for
	 * the event. False if none are found.
	 */
	willEmitId: function (event, id) {
		if (this._listeners && this._listeners[event]) {
			var arrIndex,
				arrCount,
				tmpFunc,
				arr;
			
			// Handle global emit
			if (this._listeners[event]['*']) {
				arr = this._listeners[event]['*'];
				arrCount = arr.length;
				
				for (arrIndex = 0; arrIndex < arrCount; arrIndex++) {
					// Check we have a function to execute
					tmpFunc = arr[arrIndex];
					
					if (typeof tmpFunc === 'function') {
						return true;
					}
				}
			}
			
			// Handle id emit
			if (this._listeners[event][id]) {
				arr = this._listeners[event][id];
				arrCount = arr.length;
				
				for (arrIndex = 0; arrIndex < arrCount; arrIndex++) {
					// Check we have a function to execute
					tmpFunc = arr[arrIndex];
					
					if (typeof tmpFunc === 'function') {
						return true;
					}
				}
			}
		}
		
		return false;
	},
	
	/**
	 * If events are cleared with the off() method while the event emitter is
	 * actively processing any events then the off() calls get added to a
	 * queue to be executed after the event emitter is finished. This stops
	 * errors that might occur by potentially modifying the event queue while
	 * the emitter is running through them. This method is called after the
	 * event emitter is finished processing.
	 * @private
	 */
	_processRemovalQueue: function () {
		var i;
		
		if (this._eventRemovalQueue && this._eventRemovalQueue.length) {
			// Execute each removal call
			for (i = 0; i < this._eventRemovalQueue.length; i++) {
				this._eventRemovalQueue[i]();
			}
			
			// Clear the removal queue
			this._eventRemovalQueue = [];
		}
	},
	
	/**
	 * Queues an event to be fired. This has automatic de-bouncing so that any
	 * events of the same type that occur within 100 milliseconds of a previous
	 * one will all be wrapped into a single emit rather than emitting tons of
	 * events for lots of chained inserts etc. Only the data from the last
	 * de-bounced event will be emitted.
	 * @param {String} eventName The name of the event to emit.
	 * @param {*=} data Optional data to emit with the event.
	 */
	deferEmit: function (eventName, data) {
		var self = this,
			args;
		
		if (!this._noEmitDefer && (!this._db || (this._db && !this._db._noEmitDefer))) {
			args = arguments;
			
			// Check for an existing timeout
			this._deferTimeout = this._deferTimeout || {};
			if (this._deferTimeout[eventName]) {
				clearTimeout(this._deferTimeout[eventName]);
			}
			
			// Set a timeout
			this._deferTimeout[eventName] = setTimeout(function () {
				self.emit.apply(self, args);
			}, 1);
		} else {
			this.emit.apply(this, arguments);
		}
		
		return this;
	}
};

var Emitter = function (obj) {
	if (obj) {
		// Convert the object prototype to have eventing capability
		obj.prototype.on = EventMethods.on;
		obj.prototype.off = EventMethods.off;
		obj.prototype.once = EventMethods.once;
		obj.prototype.emit = EventMethods.emit;
		obj.prototype.emitId = EventMethods.emitId;
		obj.prototype.emitStatic = EventMethods.emitStatic;
		obj.prototype.emitStaticId = EventMethods.emitStaticId;
		obj.prototype.deferEmit = EventMethods.deferEmit;
		obj.prototype.willEmit = EventMethods.willEmit;
		obj.prototype.willEmitId = EventMethods.willEmitId;
		obj.prototype._processRemovalQueue = EventMethods._processRemovalQueue;
	}
};

module.exports = Emitter;
},{"irrelon-overload":4}],4:[function(_dereq_,module,exports){
"use strict";

/**
 * Allows a method to accept overloaded calls with different parameters controlling
 * which passed overload function is called.
 * @param {Object} def
 * @returns {Function}
 * @constructor
 */
var Overload = function (def) {
	if (def) {
		var self = this,
			index,
			count,
			tmpDef,
			defNewKey,
			sigIndex,
			signatures;

		if (!(def instanceof Array)) {
			tmpDef = {};

			// Def is an object, make sure all prop names are devoid of spaces
			for (index in def) {
				if (def.hasOwnProperty(index)) {
					defNewKey = index.replace(/ /g, '');

					// Check if the definition array has a * string in it
					if (defNewKey.indexOf('*') === -1) {
						// No * found
						tmpDef[defNewKey] = def[index];
					} else {
						// A * was found, generate the different signatures that this
						// definition could represent
						signatures = this.generateSignaturePermutations(defNewKey);

						for (sigIndex = 0; sigIndex < signatures.length; sigIndex++) {
							if (!tmpDef[signatures[sigIndex]]) {
								tmpDef[signatures[sigIndex]] = def[index];
							}
						}
					}
				}
			}

			def = tmpDef;
		}

		return function () {
			var arr = [],
				lookup,
				type;

			// Check if we are being passed a key/function object or an array of functions
			if (def instanceof Array) {
				// We were passed an array of functions
				count = def.length;
				for (index = 0; index < count; index++) {
					if (def[index].length === arguments.length) {
						return self.callExtend(this, '$main', def, def[index], arguments);
					}
				}
			} else {
				// Generate lookup key from arguments
				// Copy arguments to an array
				for (index = 0; index < arguments.length; index++) {
					type = typeof arguments[index];

					// Handle detecting arrays
					if (type === 'object' && arguments[index] instanceof Array) {
						type = 'array';
					}

					// Add the type to the argument types array
					arr.push(type);
				}

				lookup = arr.join(',');

				// Check for an exact lookup match
				if (def[lookup]) {
					return self.callExtend(this, '$main', def, def[lookup], arguments);
				} else {
					for (index = arr.length; index >= 0; index--) {
						// Get the closest match
						lookup = arr.slice(0, index).join(',');

						if (def[lookup + ',...']) {
							// Matched against arguments + "any other"
							return self.callExtend(this, '$main', def, def[lookup + ',...'], arguments);
						}
					}
				}
			}

			throw('ForerunnerDB.Overload "' + this.name() + '": Overloaded method does not have a matching signature for the passed arguments: ' + JSON.stringify(arr));
		};
	}

	return function () {};
};

/**
 * Generates an array of all the different definition signatures that can be
 * created from the passed string with a catch-all wildcard *. E.g. it will
 * convert the signature: string,*,string to all potentials:
 * string,string,string
 * string,number,string
 * string,object,string,
 * string,function,string,
 * string,undefined,string
 *
 * @param {String} str Signature string with a wildcard in it.
 * @returns {Array} An array of signature strings that are generated.
 */
Overload.prototype.generateSignaturePermutations = function (str) {
	var signatures = [],
		newSignature,
		types = ['string', 'object', 'number', 'function', 'undefined'],
		index;

	if (str.indexOf('*') > -1) {
		// There is at least one "any" type, break out into multiple keys
		// We could do this at query time with regular expressions but
		// would be significantly slower
		for (index = 0; index < types.length; index++) {
			newSignature = str.replace('*', types[index]);
			signatures = signatures.concat(this.generateSignaturePermutations(newSignature));
		}
	} else {
		signatures.push(str);
	}

	return signatures;
};

Overload.prototype.callExtend = function (context, prop, propContext, func, args) {
	var tmp,
		ret;

	if (context && propContext[prop]) {
		tmp = context[prop];

		context[prop] = propContext[prop];
		ret = func.apply(context, args);
		context[prop] = tmp;

		return ret;
	} else {
		return func.apply(context, args);
	}
};

module.exports = Overload;
},{}]},{},[1,2]);
