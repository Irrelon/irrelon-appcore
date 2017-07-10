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
var AppCoreModule = require('./AppCoreModule');
var Emitter = require('irrelon-emitter');

/**
 * The main application class that ties all the application
 * modules together and exposes the appCore to the global scope
 * via window.appCore.
 * @exports AppCore
 * @constructor
 */
var AppCore = function () {
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