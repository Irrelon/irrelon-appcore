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
(function () {
	"use strict";
	
	var singelton;
	
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
		
		// The object that holds a reference to callbacks that
		// are waiting for a module to become available / loaded
		this._waiting = {};
		
		this._logLevel = 2;
	};
	
	/**
	 * Executes the passed function once all it's required dependencies
	 * have loaded.
	 * @param {Function} functionDefinition The function to execute once
	 * all its dependencies have been met.
	 * @returns {AppCore} Returns "this" to allow chaining.
	 */
	AppCore.prototype.depends = function (functionDefinition) {
		var moduleDeps,
			moduleDepsArr,
			depArgumentArr = [],
			dependenciesSatisfied = 0,
			gotDependency,
			depIndex,
			depTimeout = [];
		
		if (!functionDefinition) {
			throw('You must provide a function as the first argument to appCore.depends()!');
		}
		
		// Convert dependency list to an array
		moduleDeps = this._dependencyList(functionDefinition);
		moduleDepsArr = moduleDeps.arr;
		
		// Check if the module has dependencies
		if (!moduleDepsArr.length) {
			// No dependencies were found
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
				// We have our dependencies, load the module! YAY!
				return functionDefinition.apply(functionDefinition, depArgumentArr);
			}
		};
		
		// Register our dependency handler for each dependency
		for (depIndex = 0; depIndex < moduleDepsArr.length; depIndex++) {
			// Create a timeout that will cause a browser error if we are
			// waiting too long for a dependency to arrive
			depTimeout[depIndex] = setTimeout(this.generateDependencyTimeout(moduleDeps.func, moduleDepsArr[depIndex]), 3000);
			
			// Now ask to wait for the module
			this._waitForModule(moduleDepsArr[depIndex], gotDependency);
		}
		
		return this;
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
	
	/**
	 * Gets / registers a module with the application and executes the
	 * module's function once all it's required dependencies
	 * have loaded.
	 * @param {String} moduleName The name of the module to define.
	 * @param {Function=} moduleDefinition Optional. The function that
	 * returns the module. If omitted we will return the module
	 * specified by the "name" argument if it exists.
	 * @returns {Function|AppCore} If "moduleDefinition" is provided, returns
	 * "this" to allow chaining. If "moduleDefinition" is omitted,
	 * returns the module specified by the "name" argument.
	 */
	AppCore.prototype.module = function (moduleName, moduleDefinition) {
		var self = this,
			moduleDeps,
			moduleDepsArr,
			depArgumentArr = [],
			dependenciesSatisfied = 0,
			gotDependency,
			depIndex,
			depTimeout = [];
		
		if (!moduleName) {
			throw('You must name your module!');
		}
		
		if (!moduleDefinition) {
			return this._modules[moduleName];
		}
		
		if (this._modules[moduleName] !== undefined) {
			throw('Cannot redefine module "' + moduleName + '" - it has already been defined!');
		}
		
		if (this._logLevel >= 4) { console.log('AppCore: ' + moduleName + ': Init...'); }
		
		// Convert dependency list to an array
		moduleDeps = this._dependencyList(moduleDefinition);
		moduleDepsArr = moduleDeps.arr;
		
		// Check if the module has dependencies
		if (!moduleDepsArr.length) {
			// No dependencies were found, just register the module
			if (this._logLevel >= 4) { console.log('AppCore: ' + moduleName + ': Has no dependencies'); }
			return this._registerModule(moduleName, moduleDefinition, []);
		}
		
		if (this._logLevel >= 4) { console.log('AppCore: ' + moduleName + ': Has ' + moduleDepsArr.length + ' dependenc' + (moduleDepsArr.length > 1 ? 'ies' : 'y') + ' (' + moduleDepsArr.join(', ') + ')'); }
		
		// Grab the dependencies we need - this is a really simple way
		// to check we got our dependencies by how many times this function
		// gets called. Quick and dirty - I'm writing a game of life sim
		// here rather than a dependency injection lib after all.
		gotDependency = function (dependencyName, dependency) {
			var depArgumentIndex;
			
			dependenciesSatisfied++;
			
			if (self._logLevel >= 4) { console.log('AppCore: ' + moduleName + ': Found dependency "' + dependencyName + '"'); }
			
			// Check which index this dependency should be in
			depArgumentIndex = moduleDepsArr.indexOf(dependencyName);
			
			// Clear the timeout for the dependency
			clearTimeout(depTimeout[depArgumentIndex]);
			depTimeout[depArgumentIndex] = 0;
			
			// Assign the dependency to the correct argument index
			depArgumentArr[depArgumentIndex] = dependency;
			
			// Check if we have all the dependencies we need
			if (dependenciesSatisfied === moduleDepsArr.length) {
				// We have our dependencies, load the module! YAY!
				if (self._logLevel >= 4) { console.log('AppCore: ' + moduleName + ': Has all required dependencies, loading...'); }
				return self._registerModule(moduleName, moduleDefinition, depArgumentArr);
			}
		};
		
		// Register our dependency handler for each dependency
		for (depIndex = 0; depIndex < moduleDepsArr.length; depIndex++) {
			// Create a timeout that will cause a browser error if we are
			// waiting too long for a dependency to arrive
			depTimeout[depIndex] = setTimeout(this.generateDependencyTimeout(moduleName, moduleDepsArr[depIndex]), 3000);
			
			// Now ask to wait for the module
			this._waitForModule(moduleDepsArr[depIndex], gotDependency);
		}
		
		return this;
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
		return function () {
			if (this._logLevel >= 1) { console.error('AppCore: ' + moduleName + ': Dependency failed to load in time: ' + dependencyName); }
		};
	};
	
	/**
	 * Reads a function's definition and finds argument dependencies.
	 * @param moduleDefinition
	 * @returns {Array} An array of dependency names.
	 * @private
	 */
	AppCore.prototype._dependencyList = function (moduleDefinition) {
		var moduleString,
			moduleDeps,
			moduleDepsArr,
			moduleRegExp = /^function(.*?)\((.*?)\)/gi;
		
		// Stringify the module function
		moduleString = moduleDefinition.toString();
		moduleString = moduleString
			.replace(/\n/g, '')
			.replace(/\r/g, '')
			.replace(/\t/g, '');
		
		// Scan module function string to extract dependencies
		// via the regular expression. The dependencies this module
		// has will be a string in the moduleDeps array at index 2
		// if any dependencies were provided.
		moduleDeps = moduleRegExp.exec(moduleString);
		
		// Check if the module has dependencies
		if (!moduleDeps || !moduleDeps.length || moduleDeps[2] === "") {
			// No dependencies were found
			return {
				arr: []
			};
		}
		
		// Clean the dependency list by removing whitespace
		moduleDeps[2] = moduleDeps[2].replace(/ /gi, '');
		
		// Convert dependency list to an array
		moduleDepsArr = moduleDeps[2].split(',');
		
		return {
			arr: moduleDepsArr,
			func: moduleDeps[0]
		};
	};
	
	/**
	 * Adds the passed callback function to an array that will be
	 * processed once the named module has loaded.
	 * @param {String} moduleName The name of the module to wait for.
	 * @param {Function} callback The function to call once the
	 * named module has loaded.
	 * @returns {AppCore} Returns "this" for method chaining.
	 * @private
	 */
	AppCore.prototype._waitForModule = function (moduleName, callback) {
		// Check if the module we are waiting for already exists
		if (this._modules[moduleName] !== undefined) {
			// The module is already loaded, callback now
			callback(moduleName, this._modules[moduleName]);
			return this;
		}
		
		// Add the callback to the waiting list for this module
		this._waiting[moduleName] = this._waiting[moduleName] || [];
		this._waiting[moduleName].push(callback);
		
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
		var waitingArr,
			waitingIndex;
		
		// Tell any modules waiting for this one that we are
		// loaded and ready
		waitingArr = this._waiting[moduleName] || null;
		
		if (!waitingArr || !waitingArr.length) {
			// Nothing is waiting for us, exit
			return;
		}
		
		// Loop the waiting array and tell the receiver that
		// this module has loaded
		for (waitingIndex = 0; waitingIndex < waitingArr.length; waitingIndex++) {
			waitingArr[waitingIndex](moduleName, this._modules[moduleName]);
		}
		
		// Clear the waiting array for this module
		delete this._waiting[moduleName];
	};
	
	/**
	 * Registers a module by executing the module function and
	 * storing the result under the _modules object by name.
	 * @param {String} moduleName The name of the module to store.
	 * @param {Function} func The module function to execute and
	 * store the return value of.
	 * @param {Array} args The array of modules that this module
	 * asked for as dependencies.
	 * @private
	 */
	AppCore.prototype._registerModule = function (moduleName, func, args) {
		if (this._logLevel >= 4) { console.log('AppCore: ' + moduleName + ': Loaded'); }
		this._modules[moduleName] = func.apply(func, args) || null;
		this._moduleDefs[moduleName] = func;
		this._moduleLoaded(moduleName);
	};
	
	singelton = new AppCore();
	
	// Create the appCore instance and add to global scope
	if (typeof module  !== 'undefined' && typeof module.exports !== 'undefined') {
		module.exports = singelton;
	}
	
	if (typeof window !== 'undefined') {
		window.appCore = singelton;
	}
})();