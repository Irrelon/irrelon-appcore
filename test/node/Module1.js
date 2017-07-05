var appCore = require('../../index');

appCore.module('Module1', function (Module2) {
	var Module1 = function () {
		this.module2 = new Module2();
	};
	
	Module1.prototype.test = function () {
		console.log('Module1 test function called');
		
		this.module2.test();
	};
	
	return Module1;
});