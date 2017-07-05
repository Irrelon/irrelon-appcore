var appCore = require('../../js/AppCore');

appCore.module('Module2', function () {
	var Module2 = function () {
		
	};
	
	Module2.prototype.test = function () {
		console.log('Module2 test function called');
	};
	
	return Module2;
});