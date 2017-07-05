var Emitter = require('irrelon-emitter');

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